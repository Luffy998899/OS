import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApi } from "@/server/caller";
import { DocumentEditor } from "@/components/documents/document-editor";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getApi();
  try {
    const doc = await api.document.byId({ id });
    return <DocumentEditor initial={doc} />;
  } catch {
    notFound();
  }
}
