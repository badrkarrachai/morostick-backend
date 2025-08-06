#!/usr/bin/env python3
# Test script for RMBG-V1 background removal

import os
import sys
from PIL import Image
import argparse
import time

# Add current directory to path so we can import rmbg_inference
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from rmbg_inference import inference, check_model_exists

print("=" * 50)
print("RMBG-V1 Background Removal Test")
print("Using local model file at: ./models/model.pth")
print("=" * 50)

def remove_background(input_path, output_path, threshold=0.35, edge_enhancement=True, color_aware=True):
    """
    Remove background from an image using RMBG-V1 and save the result
    
    Args:
        input_path: Path to the input image
        output_path: Path to save the output image (PNG with transparency)
        threshold: Threshold for mask binarization (0-1)
        edge_enhancement: Whether to enhance edges for better detail
        color_aware: Whether to use color-aware processing
    """
    try:
        # Check if model exists first
        check_model_exists()
        
        print(f"Processing image: {input_path}")
        start_time = time.time()
        
        # Generate a temporary path for the mask
        mask_path = f"{os.path.splitext(output_path)[0]}_mask.png"
        
        # Run inference to get the mask
        inference(input_path, mask_path, threshold, edge_enhancement, color_aware)
        
        # Open the original image and the mask
        original = Image.open(input_path).convert("RGBA")
        mask = Image.open(mask_path).convert("L")
        
        # Resize mask to match original image if sizes differ
        if original.size != mask.size:
            mask = mask.resize(original.size, Image.LANCZOS)
        
        # Apply the mask to the original image
        original.putalpha(mask)
        
        # Save the result
        original.save(output_path)
        print(f"Background removed image saved to: {output_path}")
        
        # Remove temporary mask file
        os.remove(mask_path)
        
        elapsed = time.time() - start_time
        print(f"Background removal completed in {elapsed:.2f} seconds")
        
    except Exception as e:
        print(f"Error removing background: {e}")
        sys.exit(1)

def main():
    """Parse arguments and run background removal"""
    parser = argparse.ArgumentParser(description='Test RMBG-V1 Background Removal')
    parser.add_argument('--input', '-i', type=str, default='test_photo.jpg',
                        help='Path to input image (default: test_photo.jpg)')
    parser.add_argument('--output', '-o', type=str, default=None,
                        help='Path to save output image (default: input_nobg.png)')
    parser.add_argument('--threshold', '-t', type=float, default=0.35,
                        help='Threshold value for the mask (0-1), default: 0.35')
    parser.add_argument('--edge_enhancement', '-e', type=str, default='true',
                        help='Enable edge enhancement for better detail, options: true/false')
    parser.add_argument('--color_aware', '-c', type=str, default='true',
                        help='Enable color-aware processing for better background separation, options: true/false')
    
    args = parser.parse_args()
    
    # If output path is not provided, generate one based on input path
    if args.output is None:
        input_base = os.path.splitext(args.input)[0]
        args.output = f"{input_base}_nobg_rmbg.png"
    
    # Parse boolean arguments
    edge_enhancement = args.edge_enhancement.lower() == 'true'
    color_aware = args.color_aware.lower() == 'true'
    
    # Run background removal
    remove_background(args.input, args.output, args.threshold, edge_enhancement, color_aware)

if __name__ == "__main__":
    main() 