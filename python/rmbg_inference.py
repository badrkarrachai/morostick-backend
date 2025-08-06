#!/usr/bin/env python3
# RMBG-V1 Inference Script for MoroStick Backend
# This script loads the RMBG-V1 model and generates a segmentation mask for the input image

import sys
import os
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from io import BytesIO
import requests
from pathlib import Path
import ssl
import time
import base64
import argparse
from transformers import AutoModelForImageSegmentation, AutoFeatureExtractor, pipeline
import collections

# Handle certificate verification issues if needed
ssl._create_default_https_context = ssl._create_unverified_context

# Constants
MODEL_NAME = "briaai/RMBG-1.4"
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "model.pth")

def check_model_exists():
    """Check if the local model file exists"""
    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model file not found at {MODEL_PATH}")
        print("Please make sure the RMBG-V1 model file is in the correct location.")
        sys.exit(1)
    else:
        print(f"Found local model at {MODEL_PATH}")
    return True

def load_model():
    """Load the RMBG-V1 model from local file"""
    try:
        check_model_exists()
        
        # Load the state dict from the local file
        state_dict = torch.load(MODEL_PATH, map_location="cpu")
        
        # Check the type of the loaded model
        if isinstance(state_dict, collections.OrderedDict):
            print("Detected OrderedDict model format - creating model and loading state dict")
            # We need to load the config first, then create the model and load the state dict
            from transformers import AutoConfig
            config = AutoConfig.from_pretrained(MODEL_NAME, trust_remote_code=True)
            model = AutoModelForImageSegmentation.from_pretrained(
                None, 
                config=config,
                state_dict=state_dict,
                trust_remote_code=True
            )
        elif not isinstance(state_dict, dict) or not any(key.startswith(('encoder', 'decoder', 'model', 'backbone')) for key in state_dict.keys()):
            print("Detected non-standard model format - using model directly")
            model = state_dict
        else:
            print("Loading standard state dict into model")
            # Load model configuration but don't download weights
            model = AutoModelForImageSegmentation.from_pretrained(
                MODEL_NAME, 
                trust_remote_code=True,
                local_files_only=False
            )
            model.load_state_dict(state_dict)
        
        # Move model to appropriate device
        device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        model.to(device)
        
        print(f"RMBG-V1 model loaded successfully from local file on {device}")
        return model
    except Exception as e:
        print(f"Error loading RMBG-V1 model: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

def create_pipeline():
    """Create a custom pipeline using the local model"""
    try:
        check_model_exists()
        
        # Load local model
        model = load_model()
        
        try:
            # Try to create a pipeline with the normal approach first
            feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_NAME, trust_remote_code=True)
            segmentation_pipeline = pipeline(
                "image-segmentation", 
                model=model,
                feature_extractor=feature_extractor,
                trust_remote_code=True
            )
            return segmentation_pipeline
        except Exception as e:
            print(f"Standard pipeline creation failed, trying alternative approach: {e}")
            
            # Alternative: If the model was loaded directly and already has a pipeline structure
            if hasattr(model, 'pipe') and callable(model.pipe):
                print("Using model's built-in pipeline function")
                return model
            
            # Fallback: Try using a simple wrapper around the model
            from transformers import pipeline as hf_pipeline
            try:
                print("Attempting to create pipeline directly from HuggingFace")
                return hf_pipeline("image-segmentation", model=MODEL_NAME, trust_remote_code=True)
            except Exception as e2:
                print(f"Failed to create pipeline with fallback method: {e2}")
                raise e  # Raise the original error
        
    except Exception as e:
        print(f"Error creating pipeline: {e}")
        sys.exit(1)

def preprocess_image(image_path):
    """Load and preprocess the image"""
    if image_path.startswith(('http://', 'https://')):
        response = requests.get(image_path)
        img = Image.open(BytesIO(response.content)).convert('RGB')
    else:
        img = Image.open(image_path).convert('RGB')
    return img

def apply_threshold(mask, threshold=0.35):
    """Apply threshold to mask to create binary mask"""
    mask_array = np.array(mask)
    binary_mask = np.where(mask_array >= threshold * 255, 255, 0).astype(np.uint8)
    return Image.fromarray(binary_mask)

def enhance_mask(mask, edge_enhancement=True, color_aware=True):
    """Apply post-processing to improve mask quality"""
    mask_array = np.array(mask)
    
    # Apply edge enhancement if enabled
    if edge_enhancement:
        from scipy import ndimage
        # Detect edges using Sobel filter
        sobel_x = ndimage.sobel(mask_array, axis=0)
        sobel_y = ndimage.sobel(mask_array, axis=1)
        edge_mask = np.sqrt(sobel_x**2 + sobel_y**2)
        
        # Enhance edges
        edge_mask = edge_mask / edge_mask.max() * 255
        edge_mask = edge_mask.astype(np.uint8)
        
        # Combine with original mask
        mask_array = np.maximum(mask_array, edge_mask)
    
    # Apply color-aware processing if enabled
    if color_aware:
        # This would normally use color information from the original image
        # to refine the mask, but for simplicity, we'll just ensure the mask
        # has clean edges
        mask_array = ndimage.gaussian_filter(mask_array, sigma=0.5)
        mask_array = np.where(mask_array > 127, 255, 0).astype(np.uint8)
    
    return Image.fromarray(mask_array)

def inference(image_path, output_path, threshold=0.35, edge_enhancement=True, color_aware=True):
    """
    Run inference using RMBG-V1 model
    
    Args:
        image_path: Path to input image
        output_path: Path where the output mask will be saved
        threshold: Threshold for mask binarization (0-1)
        edge_enhancement: Whether to enhance edges for better detail
        color_aware: Whether to use color-aware processing
    
    Returns:
        PIL.Image: The generated mask as a PIL Image
    """
    try:
        # Create pipeline
        pipe = create_pipeline()
        
        # Load image
        image = preprocess_image(image_path)
        
        # Start timer
        start_time = time.time()
        
        # Run inference
        print(f"Running RMBG-V1 inference on {image_path}...")
        mask = pipe(image, return_mask=True)  # Returns a pillow mask
        
        # Apply threshold and enhancements
        mask = apply_threshold(mask, threshold)
        if edge_enhancement or color_aware:
            mask = enhance_mask(mask, edge_enhancement, color_aware)
        
        # Save mask
        mask.save(output_path)
        print(f"Mask saved to {output_path}")
        
        # Log performance
        elapsed = time.time() - start_time
        print(f"Inference completed in {elapsed:.2f} seconds")
        
        return mask
        
    except Exception as e:
        print(f"Error during inference: {e}")
        sys.exit(1)

def main():
    """Parse arguments and run inference"""
    parser = argparse.ArgumentParser(description='RMBG-V1 Background Removal')
    parser.add_argument('input_image', type=str, help='Path to input image')
    parser.add_argument('output_path', type=str, help='Path to save output mask')
    parser.add_argument('threshold', type=float, nargs='?', default=0.35, 
                        help='Threshold value for the mask (0-1), default: 0.35')
    parser.add_argument('--edge_enhancement', type=str, default='true',
                        help='Enable edge enhancement for better detail, options: true/false')
    parser.add_argument('--color_aware', type=str, default='true',
                        help='Enable color-aware processing for better background separation, options: true/false')
    
    args = parser.parse_args()
    
    # Parse boolean arguments
    edge_enhancement = args.edge_enhancement.lower() == 'true'
    color_aware = args.color_aware.lower() == 'true'
    
    # Run inference
    inference(args.input_image, args.output_path, args.threshold, edge_enhancement, color_aware)

if __name__ == "__main__":
    # If run directly, parse args and run inference
    main() 