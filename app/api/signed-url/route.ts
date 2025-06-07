import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Try creating the client with explicit error handling
let s3Client: S3Client | null = null;
try {
  s3Client = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
} catch (error) {
  console.error("Error creating S3 client:", error);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 });
  }

  if (!s3Client) {
    return NextResponse.json(
      {
        error: "S3 client not initialized",
        details: "Check server logs for more information",
      },
      { status: 500 }
    );
  }

  try {
    const command = new GetObjectCommand({
      Bucket: "wxyc-archive",
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    }); // URL expires in 1 hour
    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      {
        error: "Failed to generate signed URL",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
