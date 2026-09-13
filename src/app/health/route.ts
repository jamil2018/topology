import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL("/api/health", request.url);
  return NextResponse.redirect(url);
}
