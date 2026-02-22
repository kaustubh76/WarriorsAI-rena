"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useReconnect } from 'wagmi';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import '../home-glass.css';
// import { generateWarriorAttributes } from '../../../0G/demo-compute-flow'; // Moved to API route


// gameMasterSigningService moved to server-side /api/sign-traits
import { ipfsService } from '../../services/ipfsService';
import { getContracts, chainsToContracts, warriorsNFTAbi, getStorageApiUrl } from '../../constants';
import { useUserNFTs } from '../../hooks/useUserNFTs';
import { useWarriorsMinterMessages } from '../../hooks/useWarriorsMinterMessages';
import { usePromoteWarrior, getRankLabel, WarriorRank } from '../../hooks/usePromoteWarrior';
import { useNotifications } from '../../contexts/NotificationContext';

// 0G Storage service URL - configured via environment variable
const ZG_STORAGE_API_URL = getStorageApiUrl();

interface WarriorsTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

interface UserWarriors {
  id: number;
  tokenId: number;
  name: string;
  bio: string;
  life_history: string;
  adjectives: string;
  knowledge_areas: string;
  traits: WarriorsTraits;
  image: string;
  rank: 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum';
  totalWinnings: number;
}

const WarriorsMinterPage = memo(function WarriorsMinterPage() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    life_history: '',
    adjectives: '',
    knowledge_areas: '',
    image: null as File | null
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedWarriors, setSelectedWarriors] = useState<UserWarriors | null>(null);
  const [activeSection, setActiveSection] = useState<'create' | 'manage' | 'ai'>('create');

  const [isMinting, setIsMinting] = useState(false);
  const [ipfsCid, setIpfsCid] = useState<string | null>(null);
  const [mintStep, setMintStep] = useState<'uploading' | 'minting' | 'confirming' | null>(null);
  const { success: showSuccess, error: showError, warning: showWarning } = useNotifications();

  // Image cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 80,
    height: 80,
    x: 10,
    y: 10
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Wagmi hooks for contract interaction
  const { address: connectedAddress, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { reconnectAsync } = useReconnect();

  // Memoize the debug logging to prevent excessive console output
  useMemo(() => {
    console.log('WarriorsMinter - chainId detected:', chainId, 'connectedAddress:', connectedAddress);
  }, [chainId, connectedAddress]);

  const { writeContractAsync, data: hash } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Ensure wallet connector is active before contract calls
  // (long async uploads can cause connector to lose state with reconnectOnMount=false)
  const ensureConnected = useCallback(async () => {
    if (!isConnected || !connector) {
      console.log('Connector not active, attempting reconnect...');
      await reconnectAsync();
    }
  }, [isConnected, connector, reconnectAsync]);

  // Custom hook to manage user NFTs
  const { userNFTs, isLoadingNFTs, hasError: tokenIdsError, clearCache, debugState } = useUserNFTs(activeSection === 'manage', chainId);

  // Handle transaction confirmation and display success message
  useEffect(() => {
    if (isConfirmed && hash) {
      console.log("Transaction confirmed:", hash);
      
      // Clear NFT cache to force refresh of updated data
      clearCache();
      
      // If we were activating a Warriors, close the modal and reset state
      if (isActivating) {
        setIsActivating(false);
        setSelectedWarriors(null);
        showSuccess('Activation Complete', 'Your warrior now has traits and moves assigned.');
      }

      // If we were minting, reset the minting state
      if (isMinting) {
        setIsMinting(false);
        setMintStep(null);
        setActiveSection('manage');
        showSuccess('NFT Minted!', 'Your warrior has been forged on the blockchain.');
      }
    }
  }, [isConfirmed, hash, clearCache, isActivating, isMinting]);

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create a FileReader to read the image
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = document.createElement('img');
        img.onload = () => {
          // Check if the image is square (1:1 aspect ratio)
          if (img.width === img.height) {
            // Image is square, proceed with upload
            setFormData(prev => ({ ...prev, image: file }));
            setImagePreview(event.target?.result as string);
            console.log(`✅ Image uploaded: ${img.width}x${img.height} (Square)`);
          } else {
            // Image is not square, show cropper
            console.log(`📐 Image needs cropping: ${img.width}x${img.height} - Opening cropper`);
            setCropImageSrc(event.target?.result as string);
            
            // Set initial crop to be a square in the center (using percentage)
            const cropSizePercent = 80; // 80% of the smaller dimension
            setCrop({
              unit: '%',
              width: cropSizePercent,
              height: cropSizePercent,
              x: (100 - cropSizePercent) / 2,
              y: (100 - cropSizePercent) / 2
            });
            
            setShowCropper(true);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const generatePersonality = async () => {
    if (!aiPrompt.trim()) {
      return;
    }

    setIsGenerating(true);
    
    // Trigger warrior message
    showMessage({
      id: 'ai_start_generating',
      text: "Hark! I call upon the ancient 0G AI spirits to forge thy warrior's essence! This may take a moment, Chief...",
      duration: 5000
    });
    
    try {
      // Call 0G AI service via API route
      console.log("Sending prompt to 0G AI API:", aiPrompt);
      
      const apiResponse = await fetch('/api/generate-warrior-attributes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      
      const apiData = await apiResponse.json();
      
      if (!apiResponse.ok) {
        throw new Error(apiData.error || 'API request failed');
      }
      
      if (!apiData.success) {
        throw new Error(apiData.error || 'API returned unsuccessful response');
      }
      
      const response = apiData.attributes;
      
      // Log the response to console as requested
      console.log("0G AI Agent Response:", response);
      
      // Parse the JSON response
      try {
        const parsedResponse = JSON.parse(response);
        
        // Map the AI response to form fields
        const name = parsedResponse.name || 'AI Generated Warrior';
        const bio = parsedResponse.bio || 'Generated by 0G AI';
        
        // Handle life_history (could be string or object)
        let lifeHistory = '';
        if (typeof parsedResponse.life_history === 'string') {
          lifeHistory = parsedResponse.life_history;
        } else if (typeof parsedResponse.life_history === 'object') {
          // Convert object to readable string
          lifeHistory = Object.entries(parsedResponse.life_history)
            .map(([key, value]) => `${key}: ${value}`)
            .join('. ');
        } else {
          lifeHistory = 'Generated by 0G AI';
        }
        
        // Handle adjectives/personality traits array - check multiple possible field names
        const adjectives = Array.isArray(parsedResponse.adjectives) 
          ? parsedResponse.adjectives.join(', ')
          : Array.isArray(parsedResponse.personality_traits)
          ? parsedResponse.personality_traits.join(', ')
          : Array.isArray(parsedResponse.personality)
          ? parsedResponse.personality.join(', ')
          : 'Brave, Skilled, Strategic';
        
        // Handle knowledge_areas array
        const knowledgeAreas = Array.isArray(parsedResponse.knowledge_areas)
          ? parsedResponse.knowledge_areas.join(', ')
          : 'Combat, Strategy, Leadership';
        
        setFormData({
          name,
          bio,
          life_history: lifeHistory,
          adjectives,
          knowledge_areas: knowledgeAreas,
          image: formData.image
        });
        
      } catch (parseError) {
        console.warn("Could not parse JSON from AI response, using fallback:", parseError);
        
        // Fallback: use the raw response
        setFormData({
          name: 'AI Generated Warrior',
          bio: response.length > 200 ? response.substring(0, 200) + '...' : response,
          life_history: 'Generated by 0G AI based on your character prompt',
          adjectives: 'Unique, AI-crafted, Powerful',
          knowledge_areas: 'Specialized abilities based on your description',
          image: formData.image
        });
      }
      
    } catch (error) {
      console.error("Error generating personality with 0G AI:", error);
      
      // Fallback to show error message
      setFormData({
        name: 'Error - Try Again',
        bio: `Failed to generate character with 0G AI: ${error instanceof Error ? error.message : 'Unknown error'}`,
        life_history: 'Error occurred during generation',
        adjectives: 'Error',
        knowledge_areas: 'Error',
        image: formData.image
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Mint Warriors NFT function - uploads image and creates JSON metadata on 0G Storage
  const handleMintWarriorsNFT = async () => {
    if (!formData.image || !formData.name || !formData.bio || !formData.life_history || !formData.adjectives || !formData.knowledge_areas) {
      console.error('All form fields must be filled before minting');
      return;
    }

    setIsMinting(true);
    setMintStep('uploading');
    console.log('Starting Warriors NFT minting process...');

    // Trigger warrior message for minting start
    showMessage({
      id: 'minting_start',
      text: "By the old gods! Thy warrior shall be forged in the eternal blockchain! Prepare for battle, Chief!",
      duration: 6000
    });

    try {
      // Step 1: Upload image and create JSON metadata on 0G Storage
      console.log('Uploading warrior data to 0G Storage...');
      const uploadResult = await ipfsService.uploadWarriorsNFT({
        name: formData.name,
        bio: formData.bio,
        life_history: formData.life_history,
        adjectives: formData.adjectives,
        knowledge_areas: formData.knowledge_areas,
        image: formData.image
      });

      // Store the metadata root hash for future use (this will be used for NFT minting)
      setIpfsCid(uploadResult.metadataRootHash);

      console.log('=== WARRIORS NFT UPLOAD COMPLETE ===');
      console.log('Image Root Hash:', uploadResult.imageRootHash);
      console.log('Metadata Root Hash:', uploadResult.metadataRootHash);
      console.log('Image Transaction Hash:', uploadResult.imageTransactionHash);
      console.log('Metadata Transaction Hash:', uploadResult.metadataTransactionHash);

      // Step 2: Mint NFT on blockchain using the metadata root hash
      setMintStep('minting');
      const encryptedURI = uploadResult.metadataRootHash; // 0G root hash
      const metadataHash = `0x${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(uploadResult.metadata)))))
        .map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

      console.log('Minting NFT with parameters:');
      console.log('Encrypted URI (0G Root Hash):', encryptedURI);
      console.log('Metadata Hash:', metadataHash);

      // Step 3: Ensure wallet is still connected after the long upload, then mint
      await ensureConnected();
      await writeContractAsync({
        address: getContracts().warriorsNFT as `0x${string}`,
        abi: warriorsNFTAbi,
        functionName: 'mintNft',
        args: [encryptedURI, metadataHash],
      });

      setMintStep('confirming');
      console.log('NFT minting transaction sent! Waiting for confirmation...');
      // isMinting stays true — the useEffect on isConfirmed will reset it

    } catch (error) {
      console.error('Failed to mint Warriors NFT:', error);
      showError('Minting Failed', error instanceof Error ? error.message : 'Unknown error');
      setIsMinting(false);
      setMintStep(null);
    }
  };

  const isFormComplete = !!(formData.name && formData.bio && formData.life_history && 
                        formData.adjectives && formData.knowledge_areas && formData.image);

  // Warrior messages for engaging user experience  
  const { showMessage } = useWarriorsMinterMessages({
    isFormComplete: isFormComplete,
    isMinting: isMinting,
    isActivating: isActivating,
    mintingSuccess: isConfirmed && isMinting,
    mintingError: false, // Add error state tracking if needed
    activationSuccess: isConfirmed && isActivating,
    imageUploaded: !!formData.image,
    aiGenerating: isGenerating,
    aiSuccess: false, // Fixed this since generatedTraits doesn't exist
    isLoadingWarriors: isLoadingNFTs,
    activeSection: activeSection
  });

  const getPromotionRequirement = (rank: string): number => {
    switch (rank) {
      case 'unranked': return 1; // 1 ETH for Bronze
      case 'bronze': return 3; // 3 ETH total for Silver (1 + 2)
      case 'silver': return 6; // 6 ETH total for Gold (1 + 2 + 3)
      case 'gold': return 10; // 10 ETH total for Platinum (1 + 2 + 3 + 4)
      default: return 0;
    }
  };

  const canPromote = (warriors: UserWarriors): boolean => {
    if (warriors.rank === 'platinum') return false;
    const requirement = getPromotionRequirement(warriors.rank);
    return warriors.totalWinnings >= requirement;
  };

  const getNextRank = (currentRank: string): string => {
    switch (currentRank) {
      case 'unranked': return 'bronze';
      case 'bronze': return 'silver';
      case 'silver': return 'gold';
      case 'gold': return 'platinum';
      default: return currentRank;
    }
  };

  const getTokensNeededForPromotion = (warriors: UserWarriors): number => {
    if (warriors.rank === 'platinum') return 0;
    
    const requirement = getPromotionRequirement(warriors.rank);
    const tokensNeeded = requirement - warriors.totalWinnings;
    return Math.max(0, tokensNeeded);
  };

  // Use the promotion hook
  const { promoteWarrior, isPromoting, error: promotionError } = usePromoteWarrior();

  const handlePromoteWarriors = async (warriors: UserWarriors) => {
    try {
      showMessage({
        id: 'promotion_start',
        text: `The Council of Elders convenes to honor ${warriors.name}! The promotion ritual begins...`,
        duration: 5000
      });

      // Call the smart contract to promote the warrior
      const txHash = await promoteWarrior(BigInt(warriors.tokenId));

      showMessage({
        id: 'promotion_success',
        text: `Victory! ${warriors.name} has ascended from ${warriors.rank} to ${getNextRank(warriors.rank)}! The Arena trembles at their might!`,
        duration: 7000
      });

      console.log('Warrior promoted successfully:', txHash);

      // Refresh NFTs after promotion
      if (connectedAddress) {
        clearCache();
      }
    } catch (error) {
      console.error('Promotion failed:', error);
      showMessage({
        id: 'promotion_error',
        text: `The promotion ritual failed! ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        duration: 5000
      });
    } finally {
      setSelectedWarriors(null);
    }
  };

  // Handle Warriors activation using 0G AI
  const handleActivateWarriors = async (warriors: UserWarriors) => {
    if (!warriors) return;

    setIsActivating(true);
    
    // Trigger warrior message for activation start
    showMessage({
      id: 'activation_start',
      text: `Behold! The awakening ritual begins for ${warriors.name}! Soon they shall serve thee in the Arena, Chief!`,
      duration: 5000
    });
    
    try {
      // Create personality attributes object from warriors data
      const personalityAttributes = {
        name: warriors.name,
        bio: warriors.bio,
        life_history: warriors.life_history,
        personality: warriors.adjectives ? warriors.adjectives.split(', ') : ["Brave", "Skilled", "Strategic"],
        knowledge_areas: warriors.knowledge_areas || "Combat, Strategy, Leadership"
      };

      console.log("Created Warriors personality attributes for activation:", personalityAttributes);
      
      // Call the 0G AI service via API route
      console.log(`Activating ${warriors.name} using 0G AI traits generator...`);
      
      const apiResponse = await fetch('/api/generate-warrior-traits-moves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ personalityAttributes }),
      });
      
      const apiData = await apiResponse.json();
      
      if (!apiResponse.ok) {
        throw new Error(apiData.error || 'API request failed');
      }
      
      if (!apiData.success) {
        throw new Error(apiData.error || 'API returned unsuccessful response');
      }
      
      const response = apiData.traitsAndMoves;
      
      // Log the AI response to console as requested
      console.log("0G AI Traits Generator Response:", response);
      
      // Log the AI response to console for debugging
      console.log("🎮 WARRIOR TRAITS AND MOVES GENERATED:");
      console.log("=====================================");
      console.log(response);
      console.log("=====================================");
      
      // Try to parse and validate the response
      try {
        const parsedResponse = JSON.parse(response);
        console.log("📊 Parsed AI Response:", parsedResponse);
        
        // Validate the response structure
        const requiredFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck', 'strike_attack', 'taunt_attack', 'dodge', 'recover', 'special_move'];
        const missingFields = requiredFields.filter(field => !parsedResponse.hasOwnProperty(field));
        
        if (missingFields.length === 0) {
          console.log("✅ Response contains all required fields for traits and moves");
          
          // Validate trait values are within range
          const traits = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck'];
          const invalidTraits = traits.filter(trait => {
            const value = parsedResponse[trait];
            return typeof value !== 'number' || value < 0 || value > 10000;
          });
          
          if (invalidTraits.length === 0) {
            console.log("✅ All trait values are within valid range (0-10000)");
            console.log("🎭 Generated Traits:", {
              Strength: parsedResponse.Strength,
              Wit: parsedResponse.Wit,
              Charisma: parsedResponse.Charisma,
              Defence: parsedResponse.Defence,
              Luck: parsedResponse.Luck
            });
            console.log("⚔️ Generated Moves:", {
              strike_attack: parsedResponse.strike_attack,
              taunt_attack: parsedResponse.taunt_attack,
              dodge: parsedResponse.dodge,
              recover: parsedResponse.recover,
              special_move: parsedResponse.special_move
            });
            
            // Extract traits and moves from the AI response
            const traitsData = {
              tokenId: warriors.tokenId,
              strength: parsedResponse.Strength || 0,
              wit: parsedResponse.Wit || 0,
              charisma: parsedResponse.Charisma || 0,
              defence: parsedResponse.Defence || 0,
              luck: parsedResponse.Luck || 0,
              strike: parsedResponse.strike_attack || 'Strike',
              taunt: parsedResponse.taunt_attack || 'Taunt',
              dodge: parsedResponse.dodge || 'Dodge',
              special: parsedResponse.special_move || 'Special',
              recover: parsedResponse.recover || 'Recover'
            };
            console.log("📋 Extracted traits and moves:", traitsData);

            // Sign the data with Game Master private key via server-side API
            console.log("✍️ Requesting Game Master signature from server...");
            const signResponse = await fetch('/api/sign-traits', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(traitsData)
            });

            if (!signResponse.ok) {
              const signError = await signResponse.json();
              throw new Error(`Signing failed: ${signError.error || signResponse.statusText}`);
            }

            const signResult = await signResponse.json();
            if (!signResult.success) {
              throw new Error(`Signing failed: ${signResult.error}`);
            }

            const signature = signResult.signature as `0x${string}`;
            console.log("✍️ Game Master signature:", signature);

            // Ensure wallet is still connected after the long AI generation, then assign traits
            console.log("Calling assignTraitsAndMoves on WarriorsNFT contract...");
            await ensureConnected();
            await writeContractAsync({
              address: getContracts().warriorsNFT as `0x${string}`,
              abi: warriorsNFTAbi,
              functionName: 'assignTraitsAndMoves',
              args: [
                traitsData.tokenId,      // uint16 _tokenId
                traitsData.strength,     // uint16 _strength
                traitsData.wit,          // uint16 _wit
                traitsData.charisma,     // uint16 _charisma
                traitsData.defence,      // uint16 _defence
                traitsData.luck,         // uint16 _luck
                traitsData.strike,       // string _strike
                traitsData.taunt,        // string _taunt
                traitsData.dodge,        // string _dodge
                traitsData.special,     // string _special
                traitsData.recover,     // string _recover
                signature               // bytes _signedData
              ],
            });

            console.log("Smart contract call initiated!");
            showSuccess('Traits Assigned', `Traits and moves generated and assigned to ${warriors.name}! Awaiting confirmation.`);

          } else {
            console.warn("Invalid trait values for:", invalidTraits.join(', '));
            showWarning('Invalid Traits', `Invalid trait values generated: ${invalidTraits.join(', ')}`);
            setIsActivating(false);
          }
        } else {
          console.warn("Missing required fields:", missingFields.join(', '));
          showWarning('Missing Fields', `AI response missing required fields: ${missingFields.join(', ')}`);
          setIsActivating(false);
        }

      } catch (parseError) {
        console.warn("Could not parse JSON from AI response:", parseError);
        console.log("Raw AI Response:", response);
        showWarning('Parse Error', 'AI response received but could not be parsed. Check console for raw response.');
        setIsActivating(false);
      }

    } catch (error) {
      console.error("Error activating Warriors with 0G AI:", error);
      showError('Activation Failed', `Failed to activate ${warriors.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsActivating(false);
    }
  };

  // Helper function to check if a Warriors is inactive (all traits are zero)
  const isWarriorsInactive = (traits: WarriorsTraits) => {
    return traits.strength === 0 && 
           traits.wit === 0 && 
           traits.charisma === 0 && 
           traits.defence === 0 && 
           traits.luck === 0;
  };

  const getRankColor = (rank: string) => {
    switch (rank) {
      case 'unranked': return 'text-gray-500';
      case 'bronze': return 'text-orange-600';
      case 'silver': return 'text-gray-300';
      case 'gold': return 'text-yellow-400';
      case 'platinum': return 'text-blue-300';
      default: return 'text-gray-500';
    }
  };

  const getRankBgColor = (rank: string) => {
    switch (rank) {
      case 'unranked': return 'bg-gray-700';
      case 'bronze': return 'bg-orange-900';
      case 'silver': return 'bg-gray-600';
      case 'gold': return 'bg-yellow-900';
      case 'platinum': return 'bg-blue-900';
      default: return 'bg-gray-700';
    }
  };

  // Global cache for successfully loaded image URLs
  const imageUrlCache = useRef<Map<string, string>>(new Map());

  // Custom image component with fallback
  const WarriorsImage = memo(({ src, alt, className }: { src: string; alt: string; className: string }) => {
    // Helper function to convert image URLs
    const convertImageUrl = (url: string) => {
      // Handle null, undefined, or empty strings
      if (!url || url.trim() === '') {
        return '/lazered.png';
      }
      
      // Handle 0G storage URLs with 0g:// prefix
      if (url.startsWith('0g://')) {
        const rootHash = url.replace('0g://', '');
        return `${ZG_STORAGE_API_URL}/download/${rootHash}`;
      }

      // Handle 0G storage root hashes (direct root hash)
      if (url.startsWith('0x')) {
        return `${ZG_STORAGE_API_URL}/download/${url}`;
      }
      
      // Return as-is for HTTP URLs or local paths
      return url;
    };

    // Function to determine if we should use regular img tag
    const shouldUseRegularImg = (urlToCheck: string) => {
      // Handle null, undefined, or empty strings
      if (!urlToCheck || urlToCheck.trim() === '') {
        console.log(`🖼️ shouldUseRegularImg: Empty URL, using Next.js Image`);
        return false; // Use Next.js Image for local fallback
      }
      
      // Always use regular img for 0G storage URLs with 0g:// prefix
      if (urlToCheck.startsWith('0g://')) {
        console.log(`🖼️ shouldUseRegularImg: 0g:// URL detected (${urlToCheck}), using regular img`);
        return true;
      }
      
      // Always use regular img for 0G storage root hashes
      if (urlToCheck.startsWith('0x')) {
        console.log(`🖼️ shouldUseRegularImg: 0G root hash detected (${urlToCheck}), using regular img`);
        return true;
      }
      
      // Use regular img for 0G storage URLs (check if URL contains the storage API)
      if (urlToCheck.includes(ZG_STORAGE_API_URL.replace('http://', '').replace('https://', ''))) {
        console.log(`🖼️ shouldUseRegularImg: 0G Storage URL detected (${urlToCheck}), using regular img`);
        return true;
      }
      
      // Use regular img for any URL that doesn't start with / or http
      if (!urlToCheck.startsWith('/') && !urlToCheck.startsWith('http')) {
        console.log(`🖼️ shouldUseRegularImg: Non-standard URL detected (${urlToCheck}), using regular img`);
        return true;
      }
      
      console.log(`🖼️ shouldUseRegularImg: Standard URL (${urlToCheck}), using Next.js Image`);
      return false;
    };

    const [imageSrc, setImageSrc] = useState(() => {
      // Convert 0G root hashes to proper URLs
      const convertedSrc = convertImageUrl(src);
      // Check if we have a cached working URL for this image
      return imageUrlCache.current.get(convertedSrc) || convertedSrc;
    });
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
      const convertedSrc = convertImageUrl(src);
      
      // Check if we have a cached working URL for this image
      const cachedUrl = imageUrlCache.current.get(convertedSrc);
      if (cachedUrl && cachedUrl !== convertedSrc) {
        console.log(`🖼️ WarriorsImage: Using cached URL for ${src}: ${cachedUrl}`);
        setImageSrc(cachedUrl);
        setHasError(false);
      } else {
        console.log(`🖼️ WarriorsImage: Setting image src to: ${convertedSrc}`);
        setImageSrc(convertedSrc);
        setHasError(false);
      }
    }, [src]);

    const handleError = useCallback(() => {
      if (!hasError) {
        // For 0G storage URLs, fall back directly to placeholder
        if (src.startsWith('0x') || imageSrc.includes(ZG_STORAGE_API_URL.replace('http://', '').replace('https://', ''))) {
          console.log(`🖼️ 0G Storage failed for: ${src}, falling back to lazered.png`);
          setImageSrc('/lazered.png');
          setHasError(true);
          return;
        }
        
        // For any other failed URL, use fallback
        console.log(`🖼️ Image failed for: ${src}, falling back to lazered.png`);
        setImageSrc('/lazered.png');
        setHasError(true);
      }
    }, [imageSrc, hasError, src]);

    const handleLoad = useCallback(() => {
      // Cache the successful URL for future use
      const convertedSrc = convertImageUrl(src);
      if (imageSrc !== convertedSrc && !hasError) {
        console.log(`🖼️ Caching successful URL for ${src}: ${imageSrc}`);
        imageUrlCache.current.set(convertedSrc, imageSrc);
      }
    }, [src, imageSrc, hasError]);

    // Determine at render time whether to use regular img
    const useRegularImg = shouldUseRegularImg(imageSrc);
    
    console.log(`🖼️ WarriorsImage render: src=${src}, imageSrc=${imageSrc}, useRegularImg=${useRegularImg}`);

    if (useRegularImg) {
      return (
        <img 
          src={imageSrc}
          alt={alt}
          className={className}
          onError={handleError}
          onLoad={handleLoad}
          style={{ objectFit: 'cover' }}
        />
      );
    }

    // Safety check: if imageSrc is not a valid URL for Next.js Image, use regular img as fallback
    if (!imageSrc || !imageSrc.startsWith('/') && !imageSrc.startsWith('http')) {
      console.log(`🖼️ WarriorsImage safety fallback: Invalid URL for Next.js Image (${imageSrc}), using regular img`);
      return (
        <img 
          src={imageSrc || '/lazered.png'}
          alt={alt}
          className={className}
          onError={handleError}
          onLoad={handleLoad}
          style={{ objectFit: 'cover' }}
        />
      );
    }

    return (
      <Image 
        src={imageSrc}
        alt={alt}
        width={300}
        height={256}
        className={className}
        onError={handleError}
        onLoad={handleLoad}
      />
    );
  });
  WarriorsImage.displayName = 'WarriorsImage';

  const TraitBar = memo(({ label, value }: { label: string; value: number }) => (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span 
          className={`text-xs ${value === 0 ? 'text-red-400' : 'text-orange-400'}`}
          style={{fontFamily: 'Press Start 2P, monospace'}}
        >
          {label}
        </span>
        <span 
          className={`text-xs ${value === 0 ? 'text-red-300' : 'text-orange-300'}`}
          style={{fontFamily: 'Press Start 2P, monospace'}}
        >
          {value.toFixed(1)} {value === 0 && '(INACTIVE)'}
        </span>
      </div>
      <div className={`w-full bg-gray-800 h-2 border ${value === 0 ? 'border-red-600' : 'border-orange-600'}`}>
        <div 
          className={`h-full transition-all duration-500 ${value === 0 ? 'bg-red-500' : 'bg-orange-500'}`}
          style={{ width: `${Math.max(value, 2)}%` }} /* Show at least 2% width for zero values for visibility */
        ></div>
      </div>
    </div>
  ));
  TraitBar.displayName = 'TraitBar';

  const WarriorsCard = memo(({ warriors, onClick }: { warriors: UserWarriors; onClick: () => void }) => {
    const isInactive = isWarriorsInactive(warriors.traits);
    
    return (
      <div 
        className={`arcade-card p-6 cursor-pointer transform hover:scale-105 transition-all duration-300 ${isInactive ? 'opacity-75' : ''}`}
        onClick={onClick}
        style={{
          background: isInactive 
            ? 'radial-gradient(circle at top left, rgba(60, 60, 60, 0.15), rgba(50, 50, 50, 0.1) 50%), linear-gradient(135deg, rgba(80, 80, 80, 0.2) 0%, rgba(60, 60, 60, 0.15) 30%, rgba(80, 80, 80, 0.2) 100%)'
            : 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
          border: `3px solid ${isInactive ? '#666666' : '#ff8c00'}`,
          borderRadius: '24px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: isInactive 
            ? '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(102, 102, 102, 0.3)'
            : '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)'
        }}
      >
      <div className="w-64 h-64 mb-4 border-2 border-orange-600 rounded-2xl overflow-hidden relative mx-auto">
        <WarriorsImage 
          src={warriors.image} 
          alt={warriors.name}
          className="w-full h-full object-cover"
        />
        {/* Rank Badge */}
        <div className={`absolute top-2 right-2 px-2 py-1 rounded-xl text-xs ${getRankBgColor(warriors.rank)} ${getRankColor(warriors.rank)} border border-current`}>
          <span style={{fontFamily: 'Press Start 2P, monospace'}}>
            {warriors.rank.toUpperCase()}
          </span>
        </div>
        {/* Inactive Badge */}
        {isWarriorsInactive(warriors.traits) && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-xl text-xs bg-red-900 text-red-400 border border-red-500">
            <span style={{fontFamily: 'Press Start 2P, monospace'}}>
              INACTIVE
            </span>
          </div>
        )}
      </div>
      
      <div className="text-center mb-4">
        <h3 
          className="text-lg text-orange-400 mb-4 arcade-glow"
          style={{fontFamily: 'Press Start 2P, monospace'}}
        >
          {warriors.name}
        </h3>
      </div>

      <div className="space-y-2 mb-4">
        <TraitBar label="STR" value={warriors.traits.strength} />
        <TraitBar label="WIT" value={warriors.traits.wit} />
        <TraitBar label="CHA" value={warriors.traits.charisma} />
        <TraitBar label="DEF" value={warriors.traits.defence} />
        <TraitBar label="LCK" value={warriors.traits.luck} />
      </div>

      <div className="border-t border-orange-600 pt-4">
        <div className="flex justify-between items-center">
          <span
            className="text-sm text-green-400"
            style={{fontFamily: 'Press Start 2P, monospace'}}
          >
            {warriors.totalWinnings.toFixed(2)} CRwN
          </span>
          <span 
            className="text-xs text-gray-400"
            style={{fontFamily: 'Press Start 2P, monospace'}}
          >
            #{warriors.tokenId}
          </span>
        </div>
      </div>
    </div>
    );
  });
  WarriorsCard.displayName = 'WarriorsCard';

  // Function to convert cropped area to a File object
  const getCroppedImg = useCallback((image: HTMLImageElement, crop: PixelCrop): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('No 2d context'));
        return;
      }

      // Get the scale ratios between displayed image and natural image
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Calculate the actual crop dimensions in natural image coordinates
      const pixelCrop = {
        x: crop.x * scaleX,
        y: crop.y * scaleY,
        width: crop.width * scaleX,
        height: crop.height * scaleY,
      };

      // Set canvas size to crop size (use the original crop size for better quality)
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      console.log('Crop info:', {
        displayedSize: { width: image.width, height: image.height },
        naturalSize: { width: image.naturalWidth, height: image.naturalHeight },
        scaleX, scaleY,
        originalCrop: crop,
        pixelCrop
      });

      // Draw the cropped image
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // Convert canvas to blob then to File
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' });
          resolve(file);
        } else {
          reject(new Error('Canvas to blob conversion failed'));
        }
      }, 'image/jpeg', 0.9);
    });
  }, []);

  // Handle crop completion
  const handleCropComplete = useCallback(async () => {
    if (completedCrop && imgRef.current && cropImageSrc) {
      try {
        console.log('Starting crop with:', completedCrop);
        const croppedFile = await getCroppedImg(imgRef.current, completedCrop);
        
        // Set the cropped image as the form data
        setFormData(prev => ({ ...prev, image: croppedFile }));
        setImagePreview(URL.createObjectURL(croppedFile));
        
        // Close cropper
        setShowCropper(false);
        setCropImageSrc(null);
        
        console.log(`✅ Image cropped and uploaded: ${completedCrop.width}x${completedCrop.height} (Square)`);
      } catch (error) {
        console.error('Error cropping image:', error);
        showError('Crop Failed', 'Failed to crop image. Please try again.');
      }
    } else {
      console.log('Missing crop data:', { completedCrop, imgRef: imgRef.current, cropImageSrc });
    }
  }, [completedCrop, cropImageSrc, getCroppedImg]);

  // Handle crop cancel
  const handleCropCancel = useCallback(() => {
    setShowCropper(false);
    setCropImageSrc(null);
    setCompletedCrop(null);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/WarriorsMinter.png"
          alt="WarriorsMinter Background"
          fill
          className="object-cover"
          priority
        />
        {/* Very subtle black overlay to darken background */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.175)',
            zIndex: 1
          }}
        ></div>
      </div>
      
      {/* Epic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Geometric Battle Lines */}
        <div className="absolute top-1/4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-600 to-transparent opacity-30"></div>
        <div className="absolute bottom-1/4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-30"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 
            className="text-4xl md:text-6xl text-orange-400 mb-6 tracking-widest arcade-glow"
            style={{
              fontFamily: 'Press Start 2P, monospace'
            }}
          >
            WARRIORS MINTER
          </h1>
          <div 
            className="arcade-border p-4 mx-auto max-w-3xl"
            style={{
              background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
              border: '2px solid #ff8c00',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
              borderRadius: '24px'
            }}
          >
            <p 
              className="text-orange-400 text-sm md:text-base tracking-wide arcade-glow"
              style={{
                fontFamily: 'Press Start 2P, monospace'
              }}
            >
              FORGE YOUR LEGENDARY WARRIORS NFTs
            </p>
          </div>
        </div>

        {/* Section Navigation */}
        <div className="flex justify-center mb-8">
          <div 
            className="p-2 flex gap-2"
            style={{
              background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
              border: '3px solid #ff8c00',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
              borderRadius: '20px'
            }}
          >
            <button
              onClick={() => setActiveSection('create')}
              className={`px-6 py-3 text-xs tracking-wide transition-all duration-300 ${
                activeSection === 'create' 
                  ? 'arcade-button' 
                  : 'border-2 border-gray-600 text-gray-300 hover:border-yellow-600 hover:text-yellow-400'
              }`}
              style={{
                fontFamily: 'Press Start 2P, monospace',
                borderRadius: '12px',
                background: activeSection === 'create' ? undefined : 'rgba(0, 0, 0, 0.3)'
              }}
            >
              CREATE WARRIORS
            </button>
            <button
              onClick={() => setActiveSection('manage')}
              className={`px-6 py-3 text-xs tracking-wide transition-all duration-300 ${
                activeSection === 'manage' 
                  ? 'arcade-button' 
                  : 'border-2 border-gray-600 text-gray-300 hover:border-yellow-600 hover:text-yellow-400'
              }`}
              style={{
                fontFamily: 'Press Start 2P, monospace',
                borderRadius: '12px',
                background: activeSection === 'manage' ? undefined : 'rgba(0, 0, 0, 0.3)'
              }}
            >
              MANAGE WARRIORSS
            </button>
          </div>
        </div>

        {activeSection === 'create' && (
          <>
            {/* AI Toggle Switch */}
            <div className="flex justify-center mb-12">
              <div 
                className="p-4 flex items-center gap-4"
                style={{
                  background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                  border: '3px solid #ff8c00',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
                  borderRadius: '20px'
                }}
              >
                <span 
                  className="text-orange-400 text-sm tracking-wide arcade-glow"
                  style={{
                    fontFamily: 'Press Start 2P, monospace'
                  }}
                >
                  AI ASSISTANCE
                </span>
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`relative inline-flex items-center w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none ${
                    aiEnabled 
                      ? 'bg-yellow-600' 
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block w-6 h-6 transform bg-white rounded-full transition-transform duration-300 ${
                      aiEnabled ? 'translate-x-9' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span 
                  className={`text-sm tracking-wide ${aiEnabled ? 'text-orange-400 arcade-glow' : 'text-gray-400'}`}
                  style={{
                    fontFamily: 'Press Start 2P, monospace'
                  }}
                >
                  {aiEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Panel - AI Input (conditional) */}
            <div 
              className="arcade-card p-8"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #ff8c00',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
                borderRadius: '24px'
              }}
            >
              {aiEnabled ? (
                // AI Section
                <div>
                  <div className="mb-6">
                    <div className="weapon-container w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4">
                      <span className="text-2xl">🤖</span>
                    </div>
                    <h2 
                      className="text-2xl text-orange-400 text-center mb-4 tracking-wider arcade-glow"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      AI FORGE
                    </h2>
                    <p 
                      className="text-gray-300 text-xs text-center leading-relaxed"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      DESCRIBE YOUR IDEAL WARRIOR
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* 0G AI Info */}
                    <div className="bg-blue-900 border border-blue-600 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-yellow-400">🤖 </span>
                        <span 
                          className="text-xs text-blue-300"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          0G AI INTEGRATION
                        </span>
                      </div>
                      <p 
                        className="text-xs text-blue-200 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        POWERED BY 0G COMPUTE NETWORK
                      </p>
                      <p 
                        className="text-xs text-blue-200 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        DECENTRALIZED AI WITH TEE VERIFICATION
                      </p>
                    </div>

                    {/* 0G AI Status */}
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span 
                          className="text-xs text-yellow-400"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          0G AI STATUS
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-400"></div>
                          <span 
                            className="text-xs text-green-400"
                            style={{fontFamily: 'Press Start 2P, monospace'}}
                          >
                            READY
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p 
                                className="text-green-400 text-xs"
                                style={{fontFamily: 'Press Start 2P, monospace'}}
                              >
                                ✅ 0G COMPUTE NETWORK
                              </p>
                              <p 
                                className="text-xs text-gray-300 mt-1"
                                style={{fontFamily: 'Press Start 2P, monospace'}}
                              >
                                MODEL: LLAMA-3.3-70B-INSTRUCT
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label 
                        className="block text-yellow-400 text-xs mb-2 tracking-wide"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        CHARACTER PROMPT
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Describe the type of warrior you want to create..."
                        className="w-full h-32 bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs resize-none focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      />

                    </div>

                    <button
                      onClick={generatePersonality}
                      disabled={!aiPrompt.trim() || isGenerating}
                      className={`w-full arcade-button py-4 text-xs tracking-wide ${
                        (!aiPrompt.trim() || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        fontFamily: 'Press Start 2P, monospace',
                        borderRadius: '12px'
                      }}
                    >
                      {isGenerating ? 'GENERATING WITH 0G AI...' : 'GENERATE WITH 0G AI'}
                    </button>
                  </div>
                </div>
              ) : (
                // AI Disabled - Instructions
                <div className="text-center py-12">
                  <div className="weapon-container w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6">
                    <span className="text-2xl">⚒️</span>
                  </div>
                  <h2 
                    className="text-2xl text-orange-400 mb-6 tracking-wider arcade-glow"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    MANUAL FORGE MODE
                  </h2>
                  <p 
                    className="text-gray-300 text-xs leading-relaxed mb-4"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    CRAFT YOUR WARRIOR MANUALLY
                  </p>
                  <p 
                    className="text-gray-400 text-xs leading-relaxed"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    USE THE FORM TO DEFINE ALL ATTRIBUTES
                  </p>
                </div>
              )}
            </div>

            {/* Right Panel - Form */}
            <div 
              className="arcade-card p-8"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #ff8c00',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
                borderRadius: '24px'
              }}
            >
              <div className="mb-6">
                <h3 
                  className="text-xl text-orange-400 text-center mb-4 tracking-wider arcade-glow"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  WARRIOR ATTRIBUTES
                </h3>
              </div>

              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    NAME
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter warrior name..."
                    className="w-full bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  />
                </div>

                {/* Bio */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    BIO
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Brief description of the warrior..."
                    className="w-full h-20 bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs resize-none focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  />
                </div>

                {/* Life History */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    LIFE HISTORY
                  </label>
                  <textarea
                    value={formData.life_history}
                    onChange={(e) => handleInputChange('life_history', e.target.value)}
                    placeholder="Warrior's background and history..."
                    className="w-full h-24 bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs resize-none focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  />
                </div>

                {/* Adjectives */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    PERSONALITY TRAITS
                  </label>
                  <input
                    type="text"
                    value={formData.adjectives}
                    onChange={(e) => handleInputChange('adjectives', e.target.value)}
                    placeholder="Visionary, Ambitious, Perfectionistic..."
                    className="w-full bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  />
                </div>

                {/* Knowledge Areas */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    KNOWLEDGE AREAS
                  </label>
                  <input
                    type="text"
                    value={formData.knowledge_areas}
                    onChange={(e) => handleInputChange('knowledge_areas', e.target.value)}
                    placeholder="Military strategy, Divine weapons..."
                    className="w-full bg-gray-900 border-2 border-gray-600 text-gray-300 p-3 text-xs focus:border-yellow-600 focus:outline-none transition-colors rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label 
                    className="block text-yellow-400 text-xs mb-2 tracking-wide"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    WARRIOR IMAGE
                  </label>
                  <div className="border-2 border-dashed border-gray-600 p-4 text-center hover:border-yellow-600 transition-colors relative rounded-2xl">
                    {imagePreview ? (
                      <div className="space-y-2">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-20 h-20 mx-auto rounded-2xl object-cover border-2 border-yellow-600"
                        />
                        <p 
                          className="text-green-400 text-xs"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          IMAGE UPLOADED
                        </p>
                        <button
                          onClick={() => {setImagePreview(null); setFormData(prev => ({...prev, image: null}))}}
                          className="text-red-400 text-xs hover:text-red-300 transition-colors"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          REMOVE IMAGE
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 cursor-pointer">
                        <div className="text-2xl">📷</div>
                        <p 
                          className="text-gray-400 text-xs"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          CLICK TO UPLOAD IMAGE
                        </p>
                      </div>
                    )}
                    {!imagePreview && (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    )}
                  </div>
                </div>

                {/* Mint Button */}
                <div className="pt-4">
                  <button
                    onClick={handleMintWarriorsNFT}
                    disabled={!isFormComplete || isMinting}
                    className={`w-full arcade-button py-4 text-xs tracking-wide ${
                      !isFormComplete || isMinting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={{
                      fontFamily: 'Press Start 2P, monospace',
                      borderRadius: '12px'
                    }}
                  >
                    {isMinting
                      ? mintStep === 'uploading'
                        ? 'UPLOADING TO 0G STORAGE...'
                        : mintStep === 'minting'
                        ? 'AWAITING WALLET SIGNATURE...'
                        : mintStep === 'confirming'
                        ? 'CONFIRMING ON CHAIN...'
                        : 'MINTING...'
                      : !isFormComplete
                      ? 'COMPLETE ALL FIELDS'
                      : 'MINT WARRIORS NFT'}
                  </button>

                  {/* Mint progress steps */}
                  {isMinting && mintStep && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs" style={{ fontFamily: 'Press Start 2P, monospace' }}>
                      <span className={mintStep === 'uploading' ? 'text-yellow-400' : 'text-green-400'}>
                        {mintStep === 'uploading' ? '>' : '+'} UPLOAD
                      </span>
                      <span className="text-gray-600">-</span>
                      <span className={mintStep === 'minting' ? 'text-yellow-400' : mintStep === 'confirming' ? 'text-green-400' : 'text-gray-600'}>
                        {mintStep === 'minting' ? '>' : mintStep === 'confirming' ? '+' : '-'} SIGN
                      </span>
                      <span className="text-gray-600">-</span>
                      <span className={mintStep === 'confirming' ? 'text-yellow-400' : 'text-gray-600'}>
                        {mintStep === 'confirming' ? '>' : '-'} CONFIRM
                      </span>
                    </div>
                  )}
                  
                  {/* Display Root Hash if NFT data uploaded */}
                  {ipfsCid && (
                    <div className="mt-4 p-3 bg-green-900/30 border border-green-500 rounded-lg">
                      <p className="text-green-400 text-xs mb-2" style={{fontFamily: 'Press Start 2P, monospace'}}>
                        WARRIORS NFT METADATA UPLOADED TO 0G STORAGE
                      </p>
                      <p className="text-green-300 text-xs break-all mb-1">
                        METADATA ROOT HASH: {ipfsCid}
                      </p>
                      <p className="text-yellow-300 text-xs mb-2" style={{fontFamily: 'Press Start 2P, monospace'}}>
                        ✅ IMAGE + JSON METADATA STORED ON 0G STORAGE
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </>
        )}

        {activeSection === 'manage' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 
                className="text-2xl text-orange-400 mb-4 tracking-wider arcade-glow"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                YOUR WARRIORS NFTs
              </h2>
              <p 
                className="text-gray-300 text-sm"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                MANAGE AND PROMOTE YOUR LEGENDARY FIGHTERS
              </p>
            
              
              {!connectedAddress && (
                <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                  <p 
                    className="text-red-300 text-xs"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    CONNECT YOUR WALLET TO VIEW YOUR NFTS
                  </p>
                </div>
              )}
              {connectedAddress && !chainsToContracts[chainId] && (
                <div className="mt-4 p-4 bg-yellow-900/50 border border-yellow-500 rounded-lg">
                  <p 
                    className="text-yellow-300 text-xs"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    CONTRACTS NOT DEPLOYED ON CHAIN {chainId}. PLEASE SWITCH TO FLOW TESTNET (CHAIN 545)
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoadingNFTs ? (
                <div className="col-span-full text-center py-12">
                  <div className="loading-spinner mx-auto mb-4"></div>
                  <p 
                    className="text-yellow-400 text-sm animate-pulse mb-2"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    LOADING YOUR WARRIORS...
                  </p>
                  <p 
                    className="text-gray-400 text-xs"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    FETCHING DATA FROM BLOCKCHAIN & 0G STORAGE...
                  </p>
                  <p 
                    className="text-blue-400 text-xs mt-2"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    THIS MAY TAKE A MOMENT FOR MULTIPLE NFTS
                  </p>
                </div>
              ) : tokenIdsError ? (
                <div className="col-span-full text-center py-12">
                  <p 
                    className="text-red-400 text-sm"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    ERROR LOADING NFTS. CHECK NETWORK CONNECTION.
                  </p>
                </div>
              ) : userNFTs.length > 0 ? (
                userNFTs.map((warriors) => (
                  <WarriorsCard 
                    key={warriors.id} 
                    warriors={warriors} 
                    onClick={() => setSelectedWarriors(warriors)} 
                  />
                ))
              ) : connectedAddress ? (
                <div className="col-span-full text-center py-12">
                  <p 
                    className="text-gray-400 text-sm"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    NO WARRIORSS FOUND. CREATE YOUR FIRST WARRIOR!
                  </p>
                  <button
                    onClick={() => setActiveSection('create')}
                    className="mt-4 px-6 py-3 arcade-button text-xs tracking-wide"
                    style={{
                      fontFamily: 'Press Start 2P, monospace',
                      borderRadius: '12px'
                    }}
                  >
                    CREATE WARRIORS
                  </button>
                </div>
              ) : (
                <div className="col-span-full text-center py-12">
                  <p 
                    className="text-gray-400 text-sm"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    CONNECT WALLET TO VIEW YOUR NFTS
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warriors Detail Modal */}
        {selectedWarriors && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div 
              className="arcade-card p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #ff8c00',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
                borderRadius: '24px'
              }}
            >
              <div className="flex justify-between items-start mb-6">
                <h2 
                  className="text-2xl text-orange-400 arcade-glow"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  {selectedWarriors.name}
                </h2>
                <button 
                  onClick={() => setSelectedWarriors(null)}
                  className="text-red-400 hover:text-red-300 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <div className="w-48 h-48 mx-auto mb-6 border-2 border-orange-600 rounded-2xl overflow-hidden">
                    <WarriorsImage 
                      src={selectedWarriors.image} 
                      alt={selectedWarriors.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 
                        className="text-sm text-orange-400 mb-2"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        BIO
                      </h3>
                      <p 
                        className="text-xs text-gray-300 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        {selectedWarriors.bio}
                      </p>
                    </div>

                    <div>
                      <h3 
                        className="text-sm text-orange-400 mb-2"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        LIFE HISTORY
                      </h3>
                      <p 
                        className="text-xs text-gray-300 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        {selectedWarriors.life_history}
                      </p>
                    </div>

                    <div>
                      <h3 
                        className="text-sm text-orange-400 mb-2"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        PERSONALITY TRAITS
                      </h3>
                      <p 
                        className="text-xs text-gray-300 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        {selectedWarriors.adjectives}
                      </p>
                    </div>

                    <div>
                      <h3 
                        className="text-sm text-orange-400 mb-2"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        KNOWLEDGE AREAS
                      </h3>
                      <p 
                        className="text-xs text-gray-300 leading-relaxed"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        {selectedWarriors.knowledge_areas}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 
                    className="text-lg text-orange-400 mb-6 text-center"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    WARRIOR TRAITS
                  </h3>
                  
                  <div className="space-y-4 mb-8">
                    <TraitBar label="STRENGTH" value={selectedWarriors.traits.strength} />
                    <TraitBar label="WIT" value={selectedWarriors.traits.wit} />
                    <TraitBar label="CHARISMA" value={selectedWarriors.traits.charisma} />
                    <TraitBar label="DEFENCE" value={selectedWarriors.traits.defence} />
                    <TraitBar label="LUCK" value={selectedWarriors.traits.luck} />
                  </div>

                  <div className="border-t border-orange-600 pt-6">
                    <div className="text-center mb-6">
                      <div className="flex justify-center items-center gap-4 mb-4">
                        <div className={`px-3 py-1 rounded-xl ${getRankBgColor(selectedWarriors.rank)} ${getRankColor(selectedWarriors.rank)} border border-current`}>
                          <span 
                            className="text-xs"
                            style={{fontFamily: 'Press Start 2P, monospace'}}
                          >
                            RANK: {selectedWarriors.rank.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      
                      <p
                        className="text-sm text-green-400 mb-2"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        TOTAL WINNINGS: {selectedWarriors.totalWinnings.toFixed(2)} CRwN
                      </p>
                      
                      <p 
                        className="text-xs text-gray-400 mb-4"
                        style={{fontFamily: 'Press Start 2P, monospace'}}
                      >
                        TOKEN ID: #{selectedWarriors.tokenId}
                      </p>

                      {/* Show inactive status if Warriors is inactive */}
                      {isWarriorsInactive(selectedWarriors.traits) && (
                        <div className="mb-6">
                          <div className="bg-red-900 border-2 border-red-500 rounded-xl p-3 mb-4">
                            <p 
                              className="text-red-400 text-xs text-center"
                              style={{fontFamily: 'Press Start 2P, monospace'}}
                            >
                              ⚠️ WARRIORS IS INACTIVE
                            </p>
                            <p 
                              className="text-red-300 text-xs text-center mt-2"
                              style={{fontFamily: 'Press Start 2P, monospace'}}
                            >
                              ACTIVATE FIRST TO USE IN BATTLES
                            </p>
                          </div>
                          

                          
                          <button
                            className={`w-full arcade-button py-4 text-sm tracking-wide ${
                              isActivating ? 'opacity-50 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 border-green-500'
                            }`}
                            style={{
                              fontFamily: 'Press Start 2P, monospace',
                              borderRadius: '12px'
                            }}
                            onClick={() => handleActivateWarriors(selectedWarriors)}
                            disabled={isActivating}
                          >
                            {isActivating ? 'ACTIVATING WARRIORS...' : 'ACTIVATE WARRIORS'}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isWarriorsInactive(selectedWarriors.traits) && selectedWarriors.rank !== 'platinum' ? (
                      <div>
                        {!canPromote(selectedWarriors) && (
                          <p 
                            className="text-center text-xs text-yellow-400 mb-4"
                            style={{fontFamily: 'Press Start 2P, monospace'}}
                          >
                            You need {getTokensNeededForPromotion(selectedWarriors)} more CRwN for next rank: {getNextRank(selectedWarriors.rank).toUpperCase()}
                          </p>
                        )}
                        <button
                          onClick={() => handlePromoteWarriors(selectedWarriors)}
                          disabled={!canPromote(selectedWarriors)}
                          className={`w-full py-4 text-sm tracking-wide transition-colors ${
                            canPromote(selectedWarriors)
                              ? 'arcade-button'
                              : 'bg-gray-800 border-2 border-gray-600 text-gray-500 opacity-50 cursor-not-allowed'
                          }`}
                          style={{
                            fontFamily: 'Press Start 2P, monospace',
                            borderRadius: '12px'
                          }}
                        >
                          {canPromote(selectedWarriors) ? 'PROMOTE WARRIOR' : 'INSUFFICIENT WINNINGS'}
                        </button>
                      </div>
                    ) : !isWarriorsInactive(selectedWarriors.traits) && selectedWarriors.rank === 'platinum' ? (
                      <div className="text-center">
                        <p 
                          className="text-blue-300 text-sm py-4"
                          style={{fontFamily: 'Press Start 2P, monospace'}}
                        >
                          MAXIMUM RANK ACHIEVED!
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'ai' && (
          <div className="max-w-4xl mx-auto">
            <div 
              className="arcade-card p-8"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #ff8c00',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(255, 140, 0, 0.3)',
                borderRadius: '24px'
              }}
            >
              <div className="text-center mb-8">
                <h2 
                  className="text-2xl text-orange-400 mb-4 tracking-wider arcade-glow"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  AI FORGE ASSISTANT
                </h2>
                <p 
                  className="text-purple-200 text-sm"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  GET STRATEGIC ADVICE FOR YOUR WARRIORS
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label 
                    className="block text-purple-300 text-xs mb-2"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    ASK THE AI FORGE MASTER:
                  </label>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="What attributes should I prioritize for my next Warriors? How can I optimize my current warriors?"
                    className="w-full p-4 bg-black/50 border-2 border-purple-600 text-purple-100 text-sm rounded-2xl"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                    rows={4}
                  />
                </div>

                <button
                  onClick={() => console.log('AI assistance requested:', aiPrompt)}
                  className="w-full arcade-button py-4 text-sm tracking-wide"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  CONSULT FORGE MASTER
                </button>

                <div 
                  className="p-4 border-2 border-purple-600 rounded-2xl"
                  style={{
                    background: 'rgba(128, 0, 128, 0.1)'
                  }}
                >
                  <h3 
                    className="text-purple-300 text-xs mb-3"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    FORGE MASTER&apos;S WISDOM:
                  </h3>
                  <p 
                    className="text-purple-200 text-xs leading-relaxed"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    {aiPrompt ? 
                      "The AI Forge Master will provide strategic guidance on warrior creation, attribute optimization, and battle preparation strategies. Ask specific questions about your Warriors development!" :
                      "Enter your question above to receive ancient wisdom from the AI Forge Master..."
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image Cropper Modal */}
        {showCropper && cropImageSrc && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border-2 border-orange-600 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
              <h3 
                className="text-orange-400 text-lg mb-4 text-center"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                CROP YOUR IMAGE TO SQUARE
              </h3>
              
              <p 
                className="text-gray-400 text-xs mb-6 text-center"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                DRAG THE CORNERS TO ADJUST THE CROP AREA
              </p>

              <div className="flex justify-center mb-6">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1} // Force 1:1 aspect ratio
                  className="max-w-full max-h-96"
                >
                  <img
                    ref={imgRef}
                    src={cropImageSrc}
                    alt="Crop preview"
                    style={{ maxWidth: '100%', maxHeight: '400px' }}
                    onLoad={(e) => {
                      const { naturalWidth, naturalHeight } = e.currentTarget;
                      
                      // Calculate crop in percentage terms for the displayed image
                      const minDimension = Math.min(naturalWidth, naturalHeight);
                      const cropSizeNatural = Math.min(minDimension, Math.min(naturalWidth, naturalHeight) * 0.8);
                      
                      // Convert to percentage of displayed image
                      const cropSizePercent = (cropSizeNatural / Math.max(naturalWidth, naturalHeight)) * 100;
                      
                      const newCrop = {
                        unit: '%' as const,
                        width: cropSizePercent,
                        height: cropSizePercent,
                        x: (100 - cropSizePercent) / 2,
                        y: (100 - cropSizePercent) / 2,
                      };
                      
                      console.log('Setting initial crop:', newCrop);
                      setCrop(newCrop);
                    }}
                  />
                </ReactCrop>
              </div>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleCropCancel}
                  className="arcade-button px-6 py-3 text-xs bg-red-600 hover:bg-red-700 border-red-500"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleCropComplete}
                  disabled={!completedCrop}
                  className={`arcade-button px-6 py-3 text-xs ${
                    completedCrop 
                      ? 'bg-green-600 hover:bg-green-700 border-green-500' 
                      : 'bg-gray-600 border-gray-500 opacity-50 cursor-not-allowed'
                  }`}
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  CROP & USE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link 
            href="/"
            className="inline-block arcade-button px-6 py-3 text-xs tracking-wide"
            style={{
              fontFamily: 'Press Start 2P, monospace',
              borderRadius: '12px'
            }}
          >
            GO BACK
          </Link>
        </div>
      </div>
    </div>
  );
});

export default WarriorsMinterPage;