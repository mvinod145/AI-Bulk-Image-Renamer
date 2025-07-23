export interface ProcessedImage {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  newName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
}