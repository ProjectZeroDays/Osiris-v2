import { useState, useEffect, useCallback } from 'react';

export type PmtilesFile = {
  filename: string;
  metadata?: {
    name?: string;
    format?: string;
    minzoom?: number;
    maxzoom?: number;
  };
};

export type PmtilesState = {
  files: PmtilesFile[];
  loading: boolean;
  error: string | null;
  refreshFiles: () => Promise<void>;
  uploadFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
  deleteFile: (filename: string) => Promise<{ ok: boolean; error?: string }>;
  getFileMetadata: (filename: string) => Promise<PmtilesFile | null>;
};

export function usePmtiles() {
  const [files, setFiles] = useState<PmtilesFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pmtiles');
      const data = await res.json();
      if (data.ok) {
        setFiles(data.files.map((f: string) => ({ filename: f })));
      } else {
        setError(data.error || 'Failed to list PMTiles files');
      }
    } catch (e) {
      setError('Network error while listing PMTiles files');
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/pmtiles', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        await refreshFiles();
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Upload failed' };
    } catch (e) {
      return { ok: false, error: 'Network error during upload' };
    }
  }, [refreshFiles]);

  const deleteFile = useCallback(async (filename: string) => {
    // Note: Delete endpoint needs to be implemented in the API
    try {
      const res = await fetch(`/api/pmtiles/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        await refreshFiles();
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Delete failed' };
    } catch (e) {
      return { ok: false, error: 'Network error during delete' };
    }
  }, [refreshFiles]);

  const getFileMetadata = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`/api/pmtiles/${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.ok) {
        return { filename, metadata: data.metadata };
      }
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  return {
    files,
    loading,
    error,
    refreshFiles,
    uploadFile,
    deleteFile,
    getFileMetadata,
  };
}