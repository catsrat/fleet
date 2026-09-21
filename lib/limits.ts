// Safe to import from both server and client code (no Node or SDK imports).

/**
 * Vercel rejects any request body above 4.5 MB before it reaches the app, and files are uploaded through
 * server actions, so every upload stays under 4 MB. Phone photos are downscaled in the browser
 * (components/UploadCard.tsx) and land far below this; ID scans as PDF are normally well under 1 MB.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4 MB";
export const MAX_PAYSLIP_BYTES = MAX_UPLOAD_BYTES;
