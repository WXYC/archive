import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cookies } from "next/headers";
import { archiveConfigs, getDateRange } from "@/config/archive";

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

  // Extract date from the key (format: YYYY/MM/DD/YYYYMMDDHH00.mp3)
  const dateMatch = key.match(/(\d{4})\/(\d{2})\/(\d{2})\/\d{8}(\d{2})00\.mp3/);
  if (!dateMatch) {
    return NextResponse.json(
      { error: "Invalid file key format" },
      { status: 400 }
    );
  }

  const [, year, month, day, hour] = dateMatch;
  const fileDate = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour)
  );

  // Check authentication
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("authenticated")?.value === "true";

  // Get appropriate date range based on authentication
  const config = isAuthenticated ? archiveConfigs.dj : archiveConfigs.default;
  const { today, startDate } = getDateRange(config);

  // Check if the requested file is within the allowed date range
  if (fileDate > today || fileDate < startDate) {
    return NextResponse.json(
      { error: "File is outside the allowed date range" },
      { status: 403 }
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
