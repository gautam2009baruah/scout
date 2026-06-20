import { NextResponse } from "next/server";
import { createDocument, DocumentError, listDocuments, uploadDocuments } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

async function requireSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  }

  return { session };
}

export async function POST(request: Request) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((value): value is File => typeof value === "object" && value !== null && "arrayBuffer" in value);

    try {
      const documents = await uploadDocuments(
        {
          companyId: String(form.get("companyId") ?? ""),
          folderId: String(form.get("folderId") ?? ""),
          files
        },
        auth.session
      );

      return NextResponse.json({ documents }, { status: 201 });
    } catch (error) {
      if (error instanceof DocumentError) {
        return NextResponse.json({ message: error.message }, { status: error.statusCode });
      }

      throw error;
    }
  }

  const body = await request.json().catch(() => null);
  const documents = Array.isArray(body?.documents) ? body.documents : body ? [body] : [];

  if (documents.length === 0) {
    return NextResponse.json({ message: "Document metadata is required." }, { status: 400 });
  }

  try {
    const registered = [];

    for (const document of documents) {
      registered.push(await createDocument(
        {
          companyId: String(document.companyId ?? ""),
          folderId: String(document.folderId ?? ""),
          name: typeof document.name === "string" ? document.name : undefined,
          originalFilename: String(document.originalFilename ?? ""),
          fileType: typeof document.fileType === "string" ? document.fileType : undefined,
          mimeType: typeof document.mimeType === "string" ? document.mimeType : undefined,
          fileSize: Number(document.fileSize ?? -1),
          checksum: String(document.checksum ?? ""),
          storagePath: typeof document.storagePath === "string" ? document.storagePath : undefined,
          version: typeof document.version === "number" ? document.version : undefined
        },
        auth.session
      ));
    }

    return NextResponse.json({ documents: registered }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;

  try {
    const result = await listDocuments(
      {
        folderId: searchParams.get("folder_id") || searchParams.get("folderId") || undefined,
        status: searchParams.get("status") || undefined,
        fileType: searchParams.get("file_type") || searchParams.get("fileType") || undefined,
        search: searchParams.get("search") || undefined,
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || searchParams.get("page_size") || 20)
      },
      auth.session
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
