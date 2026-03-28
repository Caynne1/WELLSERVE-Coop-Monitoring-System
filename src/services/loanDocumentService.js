import { supabase } from './supabase';

const TABLE = 'loan_documents';
const BUCKET = 'loan-documents';

export async function uploadLoanDocument({
  loanId,
  file,
  documentType,
  label = null,
  createdBy = null,
}) {
  if (!loanId) throw new Error('loanId is required.');
  if (!file) throw new Error('File is required.');
  if (!documentType) throw new Error('documentType is required.');

  const ext = file.name.split('.').pop();
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${loanId}/${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  const payload = {
    loan_id: loanId,
    document_type: documentType,
    file_url: publicUrlData?.publicUrl || '',
    label,
    created_by: createdBy,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLoanDocumentsByLoanId(loanId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteLoanDocument(id) {
  const { data: doc, error: fetchError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  if (doc?.file_url) {
    try {
      const url = new URL(doc.file_url);
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
        await supabase.storage.from(BUCKET).remove([path]);
      }
    } catch {
      // ignore storage parse/delete errors and still remove DB row
    }
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id);

  if (error) throw error;
}