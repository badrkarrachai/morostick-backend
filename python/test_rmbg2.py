#!/usr/bin/env python3
# Test script for RMBG-2.0 ONNX model
# This script tests the RMBG-2.0 implementation using a sample image

import os
import time
import sys
from PIL import Image
import numpy as np

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import RMBG2 from our implementation
from rmbg2_inference import RMBG2, process_image

def test_rmbg2_onnx():
    """Test the RMBG-2.0 ONNX model implementation"""
    # Test image path
    test_image = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_photo.jpg")
    output_mask = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_mask_rmbg2.png")
    output_image = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_photo_nobg_rmbg2.png")
    
    if not os.path.exists(test_image):
        print("Test image not found. Creating a simple test image...")
        # Create a simple test image - a red circle on a blue background
        img = Image.new('RGB', (512, 512), color=(0, 0, 255))
        d = Image.new('L', (512, 512))
        
        # Draw a circle
        for y in range(512):
            for x in range(512):
                # Calculate distance from center
                dist = ((x - 256) ** 2 + (y - 256) ** 2) ** 0.5
                if dist < 200:
                    d.putpixel((x, y), 255)  # Inside circle
        
        # Create the image with a red circle
        img.paste((255, 0, 0), (0, 0), d)
        img.save(test_image)
        print(f"Created test image at {test_image}")
    
    print("Testing RMBG-2.0 ONNX implementation...")
    
    try:
        # Process the image
        print("Processing test image...")
        output, mask = process_image(test_image, output_image)
        
        print("Test completed successfully!")
        print(f"Output image saved to {output_image}")
        print(f"Output mask saved to {output_image.replace('.png', '_mask.png')}")
        return True
    except Exception as e:
        print(f"Test failed with error: {e}")
        return False

def compare_with_original():
    """Compare RMBG-2.0 with the original RMBG-1.4 implementation"""
    # Test image path
    test_image = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_photo.jpg")
    
    # RMBG-1.4 outputs
    from rmbg_inference import process_image as process_image_v1
    
    output_v1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_photo_nobg_v1.png")
    
    # RMBG-2.0 outputs
    output_v2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_photo_nobg_v2.png")
    
    try:
        # Test RMBG-1.4
        print("Testing RMBG-1.4...")
        start_time = time.time()
        process_image_v1(test_image, output_v1)
        v1_time = time.time() - start_time
        print(f"RMBG-1.4 completed in {v1_time:.2f} seconds")
        
        # Test RMBG-2.0
        print("Testing RMBG-2.0...")
        start_time = time.time()
        process_image(test_image, output_v2)
        v2_time = time.time() - start_time
        print(f"RMBG-2.0 completed in {v2_time:.2f} seconds")
        
        # Print comparison
        print("\nComparison Results:")
        print(f"RMBG-1.4: {v1_time:.2f} seconds")
        print(f"RMBG-2.0: {v2_time:.2f} seconds")
        print(f"Difference: {(v1_time - v2_time):.2f} seconds ({(v1_time - v2_time) / v1_time * 100:.1f}%)")
        
        # Compare file sizes
        if os.path.exists(output_v1) and os.path.exists(output_v2):
            size_v1 = os.path.getsize(output_v1)
            size_v2 = os.path.getsize(output_v2)
            print(f"RMBG-1.4 output size: {size_v1 / 1024:.1f} KB")
            print(f"RMBG-2.0 output size: {size_v2 / 1024:.1f} KB")
            
            # Open images and compare
            img_v1 = Image.open(output_v1)
            img_v2 = Image.open(output_v2)
            print(f"RMBG-1.4 image dimensions: {img_v1.size}")
            print(f"RMBG-2.0 image dimensions: {img_v2.size}")
            
            return True
        else:
            print("Comparison failed - output files not created")
            return False
            
    except Exception as e:
        print(f"Comparison failed with error: {e}")
        return False

if __name__ == "__main__":
    test_rmbg2_onnx()
    
    # Compare with original implementation
    print("\nComparing with original RMBG-1.4 implementation...")
    compare_with_original() 