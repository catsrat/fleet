import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="card max-w-md p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          That link does not exist, or you do not have access to it.
        </p>
        <Link href="/" className="btn btn-primary mt-6">Go to the start page</Link>
      </div>
    </div>
  );
}
