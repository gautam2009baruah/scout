import { NextResponse } from "next/server";
import { createDocument, discoverExternalFolder, DocumentError, listDocuments, registerExternalDocument, uploadDocuments } from "@/lib/admin/documents";
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
    const expandedDocuments = (await Promise.all(documents.map(async (document: Record<string, unknown>) => {
      const sourceKind = document.externalSourceKind ?? document.external_source_kind;
      if (sourceKind !== "folder") return [document];

      const folderUrl = String(document.externalSourceUrl ?? document.external_source_url ?? "");
      const entries = await discoverExternalFolder(folderUrl);
      return entries.map((entry) => ({
        ...document,
        ...entry,
        externalSourceReference: entry.externalSourceUrl,
        sourceMetadata: {
          ...(typeof document.sourceMetadata === "object" && document.sourceMetadata ? document.sourceMetadata : {}),
          source_folder_url: folderUrl
        }
      }));
    }))).flat();

    const registered = await Promise.all(expandedDocuments.map(async (document) => {
      const storageMode = typeof document.storageMode === "string" ? document.storageMode : typeof document.storage_mode === "string" ? document.storage_mode : "managed_upload";
      const createInput = {
        companyId: String(document.companyId ?? document.company_id ?? ""),
        folderId: String(document.folderId ?? document.folder_id ?? ""),
        name: typeof document.name === "string" ? document.name : undefined,
        originalFilename: String(document.originalFilename ?? document.original_filename ?? ""),
        fileType: typeof document.fileType === "string" ? document.fileType : typeof document.file_type === "string" ? document.file_type : undefined,
        mimeType: typeof document.mimeType === "string" ? document.mimeType : typeof document.mime_type === "string" ? document.mime_type : undefined,
        fileSize: Number(document.fileSize ?? document.file_size ?? 0),
        checksum: String(document.checksum ?? ""),
        storagePath: typeof document.storagePath === "string" ? document.storagePath : typeof document.storage_path === "string" ? document.storage_path : undefined,
        storageMode,
        externalSourceUrl: typeof document.externalSourceUrl === "string" ? document.externalSourceUrl : typeof document.external_source_url === "string" ? document.external_source_url : undefined,
        externalSourceReference: typeof document.externalSourceReference === "string" ? document.externalSourceReference : typeof document.external_source_reference === "string" ? document.external_source_reference : undefined,
        sourceMetadata: typeof document.sourceMetadata === "object" && document.sourceMetadata ? document.sourceMetadata : typeof document.source_metadata_json === "object" && document.source_metadata_json ? document.source_metadata_json : undefined,
        version: typeof document.version === "number" ? document.version : undefined
      };

      return (storageMode === "managed_upload" ? createDocument : registerExternalDocument)(
        {
          ...createInput
        },
        auth.session
      );
    }));

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
