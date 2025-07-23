import React, { useState, useCallback } from 'react';
import { ProcessedImage } from './types';
import { renameImage } from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import ResultCard from './components/ResultCard';

declare var JSZip: any;

const App: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [itemCodes, setItemCodes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesSelected = useCallback((files: File[]) => {
    setError(null);
    const newImages: ProcessedImage[] = Array.from(files).map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      originalName: file.name,
      newName: '',
      status: 'pending',
    }));

    setImages(prevImages => [...prevImages, ...newImages]);
  }, []);
  
  const handleProcessImages = useCallback(async () => {
    const codes = itemCodes.split('\n').filter(c => c.trim() !== '');
    const pendingImages = images.filter(img => img.status === 'pending');

    if (pendingImages.length === 0) {
      return;
    }
    
    if (codes.length === 0) {
      setError(`Please provide at least one item code.`);
      return;
    }

    const imageToCodeMap = new Map<string, string>();
    let unmatchedImages: ProcessedImage[] = [];

    // First pass: try to match by filename prefix.
    // This handles the case where multiple item codes are provided and image
    // filenames indicate which item they belong to.
    for (const image of pendingImages) {
        const matchingCode = codes.find(code => image.originalName.startsWith(code.trim()));
        if (matchingCode) {
            imageToCodeMap.set(image.id, matchingCode.trim());
        } else {
            unmatchedImages.push(image);
        }
    }

    // Second pass: if there's only one code and some images were unmatched,
    // assume that single code applies to all the remaining images. This supports
    // processing a batch of images with generic names against a single item code.
    if (unmatchedImages.length > 0 && codes.length === 1) {
        const singleCode = codes[0].trim();
        for (const image of unmatchedImages) {
            imageToCodeMap.set(image.id, singleCode);
        }
        unmatchedImages = []; // All images are now matched.
    }
    
    // Final check: if we still have unmatched images, it's an error.
    if (unmatchedImages.length > 0) {
        const unmatchedNames = unmatchedImages.map(img => img.originalName).slice(0, 3).join(', ');
        const extraMessage = unmatchedImages.length > 3 ? ` and ${unmatchedImages.length - 3} more` : '';
        setError(`Could not find a matching item code for some images (e.g., ${unmatchedNames}${extraMessage}). Please ensure image filenames start with a provided item code, or provide only one item code to apply to all images.`);
        return;
    }

    setError(null);
    setIsProcessing(true);

    setImages(currentImages => currentImages.map(img => 
        img.status === 'pending' ? { ...img, status: 'processing' } : img
    ));

    const processingPromises = pendingImages.map((image) => {
        const itemCode = imageToCodeMap.get(image.id);
        
        // This should technically not be reachable due to the checks above, but it's a good safeguard.
        if (!itemCode) {
            const errorMessage = `Internal Error: Could not find item code for ${image.originalName}.`;
            console.error(errorMessage);
            setImages(currentImages =>
                currentImages.map(img =>
                  img.id === image.id ? { ...img, status: 'error', errorMessage } : img
                )
            );
            return Promise.resolve();
        }

        return renameImage(image.file, itemCode)
            .then(newName => {
                setImages(currentImages =>
                    currentImages.map(img =>
                        img.id === image.id ? { ...img, status: 'completed', newName: newName.trim() } : img
                    )
                );
            })
            .catch(error => {
                console.error("Error processing image:", error);
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during processing.";
                setImages(currentImages =>
                  currentImages.map(img =>
                    img.id === image.id ? { ...img, status: 'error', errorMessage } : img
                  )
                );
            });
    });

    await Promise.all(processingPromises);
    setIsProcessing(false);

  }, [images, itemCodes]);

  const handleClear = () => {
    images.forEach(image => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setItemCodes('');
    setError(null);
  };
  
  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const completedImages = images.filter(img => img.status === 'completed');

    if (completedImages.length === 0) return;

    completedImages.forEach(image => {
        zip.file(image.newName, image.file);
    });

    zip.generateAsync({ type: 'blob' }).then((content: any) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'renamed_images.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
  };
  
  const pendingImagesCount = images.filter(i => i.status === 'pending').length;
  const completedImagesCount = images.filter(i => i.status === 'completed').length;

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="bg-slate-800 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              📸 AI Bulk Image Renamer
            </h1>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {completedImagesCount > 0 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={isProcessing}
                  className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500 disabled:bg-green-400 disabled:cursor-not-allowed"
                >
                  Download All
                </button>
              )}
             {images.length > 0 && (
              <button
                onClick={handleClear}
                disabled={isProcessing}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-red-500 disabled:bg-red-400 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <div className="mb-4">
                  <label htmlFor="itemCodes" className="block text-sm font-medium text-slate-700 mb-2">
                      1. Paste Item Codes (one per line)
                  </label>
                  <textarea
                      id="itemCodes"
                      value={itemCodes}
                      onChange={(e) => setItemCodes(e.target.value)}
                      rows={5}
                      className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition disabled:bg-slate-50 disabled:cursor-not-allowed"
                      placeholder="L41086600 (for a batch of images)&#10;or&#10;L41086601 (one per image)&#10;L47231700&#10;..."
                      disabled={isProcessing}
                  />
              </div>
              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">
                      2. Upload Matching Images
                  </label>
                <ImageUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />
              </div>
            </div>

            {error && (
              <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
                  <p className="font-bold">Error</p>
                  <p>{error}</p>
              </div>
            )}
            
            {pendingImagesCount > 0 && (
              <div className="my-6 text-center">
                <button
                  onClick={handleProcessImages}
                  disabled={isProcessing}
                  className="px-8 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {isProcessing ? 'Processing...' : `Process ${pendingImagesCount} Image(s)`}
                </button>
              </div>
            )}

            {images.length > 0 && (
                 <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {images.map(image => (
                        <ResultCard key={image.id} image={image} />
                    ))}
                 </div>
            )}

            {images.length === 0 && (
                 <div className="text-center mt-12 text-slate-500">
                    <p className="text-lg">Ready to start renaming.</p>
                    <p className="text-sm mt-1">Enter item codes and upload your product images.</p>
                 </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
