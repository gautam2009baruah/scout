import { NextResponse } from "next/server";
import { DocumentError, getDocumentDownload } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "document";
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const { document, file } = await getDocumentDownload(id, session);

    return new NextResponse(new Blob([new Uint8Array(file)]), {
      headers: {
        "Content-Disposition": contentDisposition(document.originalFilename),
        "Content-Length": String(file.length),
        "Content-Type": document.mimeType || "application/octet-stream"
      }
    });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error("Unable to download document", error);
    return NextResponse.json({ message: "Unable to download the document right now." }, { status: 500 });
  }
}
