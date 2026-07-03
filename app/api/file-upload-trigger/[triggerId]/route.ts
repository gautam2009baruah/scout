// File Upload Trigger Endpoint
// POST /api/file-upload-trigger/[triggerId]

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { FileUploadTriggerConfig } from "@/shared/orchestrationTypes";
import { createExecution } from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

async function executeInBackground(execution: any, nodes: any[], connections: any[]) {
  try {
    const engine = new OrchestrationEngine(execution, nodes, connections);
    await engine.execute();
  } catch (error) {
    console.error("Background execution error:", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  const { triggerId } = await params;
  const pool = await getPool();
  const startTime = Date.now();

  try {
    // Get trigger configuration
    const triggerResult = await pool.query<{
      id: string;
      orchestration_id: string;
      name: string;
      config: FileUploadTriggerConfig;
    }>(
      `SELECT t.id, t.orchestration_id, t.name, t.config
       FROM orchestration_triggers t
       WHERE t.id = $1 AND t.trigger_type = 'file_upload' AND t.status = 'active'`,
      [triggerId]
    );

    if (triggerResult.rowCount === 0) {
      return NextResponse.json(
        { error: "File upload trigger not found or inactive" },
        { status: 404 }
      );
    }

    const trigger = triggerResult.rows[0];
    const config = trigger.config;

    if (!config.enabled) {
      return NextResponse.json(
        { error: "File upload trigger is disabled" },
        { status: 403 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll("file");
    const metadataJson = formData.get("metadata") as string | null;
    const uploadedBy = formData.get("uploadedBy") as string | null;

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files uploaded" },
        { status: 400 }
      );
    }

    if (!config.allowMultipleFiles && files.length > 1) {
      return NextResponse.json(
        { error: "Multiple files not allowed for this trigger" },
        { status: 400 }
      );
    }

    // Parse metadata
    let metadata: Record<string, unknown> = {};
    if (metadataJson) {
      try {
        metadata = JSON.parse(metadataJson);
      } catch (error) {
        return NextResponse.json(
          { error: "Invalid metadata JSON" },
          { status: 400 }
        );
      }
    }

    // Validate required metadata fields
    if (config.requiredMetadata) {
      for (const field of config.requiredMetadata) {
        if (field.required && !metadata[field.name]) {
          return NextResponse.json(
            { error: `Required metadata field missing: ${field.label}` },
            { status: 400 }
          );
        }
      }
    }

    const uploadedFiles: Array<{
      fileId: string;
      fileName: string;
      originalName: string;
      contentType: string;
      size: number;
      storagePath: string;
    }> = [];

    // Process each file
    for (const fileItem of files) {
      const file = fileItem as File;

      // Validate file type
      const fileExt = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
      if (!config.allowedFileTypes.includes(fileExt)) {
        return NextResponse.json(
          { error: `File type ${fileExt} not allowed. Allowed types: ${config.allowedFileTypes.join(", ")}` },
          { status: 400 }
        );
      }

      // Validate file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > config.maxFileSizeMB) {
        return NextResponse.json(
          { error: `File size ${fileSizeMB.toFixed(2)}MB exceeds maximum ${config.maxFileSizeMB}MB` },
          { status: 400 }
        );
      }

      // Generate unique filename
      const fileId = randomBytes(16).toString("hex");
      const fileName = `${fileId}${fileExt}`;
      const storagePath = join(config.storageLocation, fileName);

      // Save file to storage
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Ensure storage directory exists
      await mkdir(config.storageLocation, { recursive: true });
      await writeFile(storagePath, buffer);

      // Record file in database
      const fileResult = await pool.query(
        `INSERT INTO file_upload_trigger_files
         (trigger_id, orchestration_id, file_name, original_name, content_type, file_size,
          storage_path, uploaded_by, metadata, virus_scan_status, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'uploaded')
         RETURNING id`,
        [
          triggerId,
          trigger.orchestration_id,
          fileName,
          file.name,
          file.type,
          file.size,
          storagePath,
          uploadedBy,
          JSON.stringify(metadata),
          config.virusScanEnabled ? "pending" : "skipped",
        ]
      );

      uploadedFiles.push({
        fileId: fileResult.rows[0].id,
        fileName,
        originalName: file.name,
        contentType: file.type,
        size: file.size,
        storagePath,
      });
    }

    // TODO: Virus scan if enabled
    // if (config.virusScanEnabled) {
    //   await performVirusScan(uploadedFiles);
    // }

    // Get orchestration details
    const orchResult = await pool.query(
      `SELECT id, version, company_id, name FROM orchestrations
       WHERE id = $1 AND status = 'published'`,
      [trigger.orchestration_id]
    );

    if (orchResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Orchestration not found or not published" },
        { status: 404 }
      );
    }

    const orchestration = orchResult.rows[0];

    // Create orchestration execution
    const execution = await createExecution({
      orchestrationId: orchestration.id,
      orchestrationVersion: orchestration.version,
      context: {},
      triggerData: {
        type: "file_upload",
        triggerId,
        uploadedBy,
        files: uploadedFiles,
        metadata,
      },
      triggeredBy: uploadedBy || "anonymous",
    });

    // Update file records with execution ID
    for (const file of uploadedFiles) {
      await pool.query(
        `UPDATE file_upload_trigger_files
         SET execution_id = $2, status = 'processing', processed_at = NOW()
         WHERE id = $1`,
        [file.fileId, execution.id]
      );
    }

    // Log trigger execution
    await pool.query(
      `INSERT INTO trigger_execution_logs
       (trigger_id, orchestration_id, execution_id, status, payload, triggered_by)
       VALUES ($1, $2, $3, 'started', $4, $5)`,
      [
        triggerId,
        orchestration.id,
        execution.id,
        JSON.stringify({ files: uploadedFiles, metadata }),
        uploadedBy || "anonymous",
      ]
    );

    // Execute orchestration in background
    const nodesResult = await pool.query(
      `SELECT * FROM orchestration_nodes WHERE orchestration_id = $1 ORDER BY created_at`,
      [orchestration.id]
    );

    const connectionsResult = await pool.query(
      `SELECT * FROM orchestration_connections WHERE orchestration_id = $1 ORDER BY created_at`,
      [orchestration.id]
    );

    const nodes = nodesResult.rows;
    const connections = connectionsResult.rows;

    setImmediate(() => executeInBackground(execution, nodes, connections));

    const duration = Date.now() - startTime;

    return NextResponse.json({
      executionId: execution.id,
      files: uploadedFiles.map(f => ({
        fileId: f.fileId,
        fileName: f.originalName,
        size: f.size,
      })),
      message: "Files uploaded and orchestration started successfully",
      duration_ms: duration,
    });

  } catch (error) {
    console.error("File upload trigger error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Get file upload form configuration
export async function GET(
  request: Request,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  const { triggerId } = await params;
  const pool = await getPool();

  try {
    const result = await pool.query<{
      name: string;
      description: string | null;
      config: FileUploadTriggerConfig;
    }>(
      `SELECT t.name, t.description, t.config
       FROM orchestration_triggers t
       WHERE t.id = $1 AND t.trigger_type = 'file_upload' AND t.status = 'active'`,
      [triggerId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "File upload trigger not found or inactive" },
        { status: 404 }
      );
    }

    const trigger = result.rows[0];
    const config = trigger.config;

    return NextResponse.json({
      name: trigger.name,
      description: trigger.description,
      allowedFileTypes: config.allowedFileTypes,
      maxFileSizeMB: config.maxFileSizeMB,
      allowMultipleFiles: config.allowMultipleFiles,
      requiredMetadata: config.requiredMetadata || [],
    });

  } catch (error) {
    console.error("Error fetching trigger config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
