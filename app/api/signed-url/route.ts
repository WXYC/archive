import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { archiveConfigs, getDateRange } from "@/config/archive";
import { verifyAuthHeader } from "@/lib/jwt-utils";
import { roleToAuthorization, Authorization } from "@wxyc/shared/auth-client/auth";

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

export async function POST(request: Request) {
  const { key } = await request.json();

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

  // DJ-level access comes from one place: a better-auth JWT carrying a DJ role
  // claim. The `role` claim is the WXYC station role (populated from the
  // organization member table), not the admin-plugin `user.role`.
  const authHeader = request.headers.get("Authorization");
  const verifyResult = await verifyAuthHeader(authHeader);
  // Compared as an ordered rank rather than a set membership test: the claim
  // can legitimately arrive as an elevated alias ("admin", "owner"), which
  // ranks at stationManager and so clears the DJ bar. isDJRole matches the
  // three canonical names exactly and would refuse those.
  // The typeof guard is load-bearing, not defensive noise: verifyToken casts
  // the `role` claim rather than checking it, and canonicalizeRole calls
  // .toLowerCase() on whatever arrives — so a signature-valid token carrying a
  // number, array or object as `role` would throw here. This runs outside the
  // route's try block, so that throw became a 500 instead of the quiet
  // fallback to the public window. isDJRole was total and simply said false.
  const hasDJAccess =
    verifyResult.authenticated &&
    typeof verifyResult.role === "string" &&
    roleToAuthorization(verifyResult.role) >= Authorization.DJ;

  // Get appropriate date range based on authentication
  const config = hasDJAccess ? archiveConfigs.dj : archiveConfigs.default;
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
      ResponseContentDisposition: `attachment; filename="wxyc_${year}${month}${day}_${hour}00.mp3"`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
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
