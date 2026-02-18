import { NextResponse, type NextRequest } from "next/server";
import { getStorageApiUrl } from '@/constants';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// 0G Storage service URL - configured via environment variable
const STORAGE_API_URL = getStorageApiUrl();

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'files-upload', ...RateLimitPresets.fileUpload }),
  async (req, ctx) => {
    const data = await req.formData();
    const file: File | null = data.get("file") as unknown as File;

    // Get form data for JSON metadata
    const name = data.get("name") as string;
    const bio = data.get("bio") as string;
    const life_history = data.get("life_history") as string;
    const adjectives = data.get("adjectives") as string;
    const knowledge_areas = data.get("knowledge_areas") as string;

    if (!file) {
      throw ErrorResponses.badRequest("No file received");
    }

    console.log("Uploading file to 0G Storage:", file.name, "(" + (file.size / 1024 / 1024).toFixed(2) + " MB)");

    // Step 1: Upload image to 0G Storage
    const imageFormData = new FormData();
    imageFormData.append('file', file);

    const imageUploadResponse = await fetch(`${STORAGE_API_URL}/upload`, {
      method: 'POST',
      body: imageFormData,
    });

    if (!imageUploadResponse.ok) {
      throw new Error(`Image upload failed: ${imageUploadResponse.statusText}`);
    }

    const imageResult = await imageUploadResponse.json();
    const imageRootHash = imageResult.rootHash;
    const imageTransactionHash = imageResult.transactionHash;

    console.log("Image uploaded successfully to 0G Storage!");
    console.log("Image Root Hash:", imageRootHash);
    console.log("Image Transaction Hash:", imageTransactionHash);

    // Step 2: Create JSON metadata with 0G Storage image reference
    const metadata = {
      name: name || "Unknown Warrior",
      bio: bio || "A legendary warrior",
      life_history: life_history || "History unknown",
      personality: adjectives ? adjectives.split(', ').map(trait => trait.trim()) : ["Brave", "Skilled"],
      knowledge_areas: knowledge_areas ? knowledge_areas.split(', ').map(area => area.trim()) : ["Combat", "Strategy"],
      image: `0g://${imageRootHash}`, // Using 0G storage reference
      image_root_hash: imageRootHash, // Store the root hash for direct access
      image_transaction_hash: imageTransactionHash
    };

    console.log("Created metadata JSON:", metadata);

    // Step 3: Upload JSON metadata to 0G Storage
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: 'application/json'
    });
    const metadataFile = new File([metadataBlob], 'metadata.json', {
      type: 'application/json'
    });

    const metadataFormData = new FormData();
    metadataFormData.append('file', metadataFile);

    const metadataUploadResponse = await fetch(`${STORAGE_API_URL}/upload`, {
      method: 'POST',
      body: metadataFormData,
    });

    if (!metadataUploadResponse.ok) {
      throw new Error(`Metadata upload failed: ${metadataUploadResponse.statusText}`);
    }

    const metadataResult = await metadataUploadResponse.json();
    const metadataRootHash = metadataResult.rootHash;
    const metadataTransactionHash = metadataResult.transactionHash;

    console.log("Metadata JSON uploaded successfully to 0G Storage!");
    console.log("Metadata Root Hash:", metadataRootHash);
    console.log("Metadata Transaction Hash:", metadataTransactionHash);

    console.log("=== 0G STORAGE UPLOAD COMPLETE ===");
    console.log("Image Root Hash:", imageRootHash);
    console.log("Metadata Root Hash:", metadataRootHash);
    console.log("Image Transaction Hash:", imageTransactionHash);
    console.log("Metadata Transaction Hash:", metadataTransactionHash);
    console.log("=======================================");

    return NextResponse.json({
      success: true,
      imageRootHash: imageRootHash,
      imageTransactionHash: imageTransactionHash,
      metadataRootHash: metadataRootHash,
      metadataTransactionHash: metadataTransactionHash,
      metadata: metadata,
      size: file.size,
      // Legacy compatibility fields (using root hashes as CIDs)
      imageCid: imageRootHash,
      metadataCid: metadataRootHash,
      imageUrl: `0g://${imageRootHash}`,
      metadataUrl: `0g://${metadataRootHash}`
    }, { status: 200 });
  },
], { errorContext: 'API:Files:POST' });