/**
 * File Upload/Download Utilities
 * Handle file operations, validation, and format conversion
 */

/**
 * File validation rules
 */
export interface FileValidationRules {
  maxSize?: number; // in bytes
  minSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  maxFiles?: number;
}

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate single file
 */
export function validateFile(
  file: File,
  rules: FileValidationRules
): FileValidationResult {
  const errors: string[] = [];

  // Check file size
  if (rules.maxSize && file.size > rules.maxSize) {
    errors.push(`File size exceeds maximum of ${formatFileSize(rules.maxSize)}`);
  }

  if (rules.minSize && file.size < rules.minSize) {
    errors.push(`File size is below minimum of ${formatFileSize(rules.minSize)}`);
  }

  // Check file type
  if (rules.allowedTypes && !rules.allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }

  // Check file extension
  if (rules.allowedExtensions) {
    const extension = getFileExtension(file.name);
    if (!rules.allowedExtensions.includes(extension)) {
      errors.push(`File extension .${extension} is not allowed`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate multiple files
 */
export function validateFiles(
  files: File[],
  rules: FileValidationRules
): FileValidationResult {
  const errors: string[] = [];

  // Check number of files
  if (rules.maxFiles && files.length > rules.maxFiles) {
    errors.push(`Maximum ${rules.maxFiles} files allowed`);
  }

  // Validate each file
  files.forEach((file, index) => {
    const result = validateFile(file, rules);
    if (!result.valid) {
      result.errors.forEach(error => {
        errors.push(`File ${index + 1} (${file.name}): ${error}`);
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Get file name without extension
 */
export function getFileNameWithoutExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length === 1) return filename;
  parts.pop();
  return parts.join('.');
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Read file as data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Read file as ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert File to Base64
 */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await readFileAsDataURL(file);
  return dataUrl.split(',')[1]; // Remove data:*/*;base64, prefix
}

/**
 * Convert Base64 to Blob
 */
export function base64ToBlob(base64: string, type: string = 'application/octet-stream'): Blob {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type });
}

/**
 * Download file from URL
 */
export function downloadFile(url: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download data as file
 */
export function downloadData(
  data: string | Blob,
  filename: string,
  type: string = 'text/plain'
): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  downloadFile(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Download JSON as file
 */
export function downloadJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadData(json, filename, 'application/json');
}

/**
 * Download CSV as file
 */
export function downloadCSV(data: string[][], filename: string): void {
  const csv = data.map(row => row.join(',')).join('\n');
  downloadData(csv, filename, 'text/csv');
}

/**
 * Upload file with progress tracking
 */
export async function uploadFile(
  file: File,
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const { method = 'POST', headers = {}, onProgress, signal } = options || {};

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });
    }

    // Handle completion
    xhr.addEventListener('load', () => {
      const response = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
      });
      resolve(response);
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    // Prepare and send request
    xhr.open(method, url);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/**
 * Upload multiple files
 */
export async function uploadFiles(
  files: File[],
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    onProgress?: (fileIndex: number, progress: number) => void;
    onComplete?: (fileIndex: number) => void;
    signal?: AbortSignal;
  }
): Promise<Response[]> {
  const { onProgress, onComplete, ...uploadOptions } = options || {};
  const results: Response[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const response = await uploadFile(file, url, {
      ...uploadOptions,
      onProgress: onProgress ? (progress) => onProgress(i, progress) : undefined,
    });
    results.push(response);
    onComplete?.(i);
  }

  return results;
}

/**
 * Compress image file
 */
export async function compressImage(
  file: File,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    type?: string;
  }
): Promise<Blob> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    type = 'image/jpeg',
  } = options || {};

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Could not compress image'));
          }
        },
        type,
        quality
      );
    };

    img.onerror = () => reject(new Error('Could not load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Get image dimensions
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      reject(new Error('Could not load image'));
      URL.revokeObjectURL(img.src);
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Common file type groups
 */
export const FileTypes = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  videos: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  archives: ['application/zip', 'application/x-rar-compressed', 'application/x-tar'],
  text: ['text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript'],
} as const;

/**
 * Common file size limits
 */
export const FileSizeLimits = {
  avatar: 2 * 1024 * 1024, // 2 MB
  image: 5 * 1024 * 1024, // 5 MB
  document: 10 * 1024 * 1024, // 10 MB
  video: 50 * 1024 * 1024, // 50 MB
  large: 100 * 1024 * 1024, // 100 MB
} as const;

/**
 * Create a file input element programmatically
 */
export function createFileInput(options?: {
  accept?: string;
  multiple?: boolean;
  onChange?: (files: FileList | null) => void;
}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';

  if (options?.accept) {
    input.accept = options.accept;
  }

  if (options?.multiple) {
    input.multiple = true;
  }

  if (options?.onChange) {
    input.addEventListener('change', () => {
      options.onChange?.(input.files);
    });
  }

  return input;
}

/**
 * Open file picker dialog
 */
export function openFilePicker(options?: {
  accept?: string;
  multiple?: boolean;
}): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = createFileInput({
      ...options,
      onChange: (files) => resolve(files),
    });

    input.click();
  });
}

/**
 * Convert FileList to Array
 */
export function fileListToArray(fileList: FileList): File[] {
  return Array.from(fileList);
}

/**
 * Check if file is image
 */
export function isImage(file: File): boolean {
  return FileTypes.images.includes(file.type);
}

/**
 * Check if file is video
 */
export function isVideo(file: File): boolean {
  return FileTypes.videos.includes(file.type);
}

/**
 * Check if file is document
 */
export function isDocument(file: File): boolean {
  return FileTypes.documents.includes(file.type);
}
