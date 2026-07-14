import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function targetBaseUrl() {
  return (process.env.HTTP_TRIGGER_API_URL || "http://localhost:4303").replace(/\/$/, "");
}

function joinPath(shortName: string, pathSegments: string[] = []) {
  const escapedShortName = encodeURIComponent(shortName);
  const escapedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return escapedPath ? `/apitrigger/${escapedShortName}/${escapedPath}` : `/apitrigger/${escapedShortName}`;
}

function copyProxyHeaders(source: Headers) {
  const headers = new Headers();
  const passThrough = [
    "content-type",
    "authorization",
    "x-api-key",
    "x-correlation-id",
    "x-request-id",
    "x-forwarded-for",
    "x-real-ip",
    "x-forwarded-proto",
    "user-agent",
    "accept"
  ];

  for (const name of passThrough) {
    const value = source.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return headers;
}

async function proxy(
  request: NextRequest,
  params: { shortName: string; pathSegments?: string[] }
) {
  const path = joinPath(params.shortName, params.pathSegments || []);
  const incomingUrl = new URL(request.url);
  const proxyUrl = `${targetBaseUrl()}${path}${incomingUrl.search}`;

  const response = await fetch(proxyUrl, {
    method: request.method,
    headers: copyProxyHeaders(request.headers),
    body: ["GET", "HEAD"].includes(request.method.toUpperCase()) ? undefined : await request.text(),
    cache: "no-store"
  });

  if (request.method.toUpperCase() === "HEAD") {
    return new NextResponse(null, { status: response.status, headers: response.headers });
  }

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: response.headers
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return NextResponse.json({ success: false, message: "HTTP trigger API is unavailable." }, { status: 503 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return NextResponse.json({ success: false, message: "HTTP trigger API is unavailable." }, { status: 503 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return NextResponse.json({ success: false, message: "HTTP trigger API is unavailable." }, { status: 503 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return NextResponse.json({ success: false, message: "HTTP trigger API is unavailable." }, { status: 503 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return NextResponse.json({ success: false, message: "HTTP trigger API is unavailable." }, { status: 503 });
  }
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  try {
    return await proxy(request, await context.params);
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: {
        allow: "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS"
      }
    });
  }
}
