# Document Job Worker Service

Worker service for document parse/chunk/embed processing jobs.

## Run

- `npm run jobs:documents`

The service uses Node.js worker threads and processes multiple database jobs concurrently.
Set `DOCUMENT_JOB_WORKER_THREADS` to control concurrency. It defaults to the smaller of
four threads or the number of available CPU cores.

Use `node service/document-job-worker/src/worker.mjs --once` to process at most one job
in the main thread for diagnostics.
