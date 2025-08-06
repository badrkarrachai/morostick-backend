#!/usr/bin/env python3
# RMBG-2.0 Background Removal Script using ONNX Model
# This script loads the RMBG-2.0 ONNX model and generates an alpha mask for the input image

import sys
import os
import numpy as np
from PIL import Image
import onnxruntime as ort
import time
import argparse
from io import BytesIO
import requests
import urllib.request
import ssl
from scipy import ndimage

# Bypass SSL certificate validation (for downloads)
ssl._create_default_https_context = ssl._create_unverified_context

# Constants
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "model_q4f16.onnx")
INPUT_SIZE = 1024  # Standard input size for the model

class RMBG2:
    def __init__(self, model_path=None):
        """Initialize the RMBG-2.0 model with ONNX Runtime"""
        self.model_path = model_path or MODEL_PATH
        print(f"Loading ONNX model from {self.model_path}")
        
        # Configure ONNX Runtime session
        sess_options = ort.SessionOptions()
        
        # Set execution providers - try CPU only first as it's more compatible
        self.providers = ['CPUExecutionProvider']
        
        # Print available providers
        available_providers = ort.get_available_providers()
        print(f"Available providers: {available_providers}")
        print(f"Using providers: {self.providers}")
        
        try:
            # Create ONNX Runtime session with CPU provider only for maximum compatibility
            self.ort_session = ort.InferenceSession(
                self.model_path, 
                sess_options=sess_options,
                providers=self.providers
            )
            
            # Get model metadata
            self.input_name = self.ort_session.get_inputs()[0].name
            self.output_name = self.ort_session.get_outputs()[0].name
            self.input_shape = self.ort_session.get_inputs()[0].shape
            
            # Report successful initialization
            print(f"Model loaded successfully. Input shape: {self.input_shape}")
        except Exception as e:
            print(f"Error initializing ONNX model: {e}")
            raise

    def predict(self, img):
        """Run inference on the input image and return the segmentation mask"""
        # Preprocess the image
        img_input = self._preprocess(img)
        
        # Run inference
        start_time = time.time()
        mask = self._inference(img_input)
        inference_time = time.time() - start_time
        
        # Postprocess the mask
        mask = self._postprocess(mask, img.size)
        
        print(f"Inference time: {inference_time:.3f} seconds")
        return mask

    def _preprocess(self, img):
        """Preprocess the image for the model"""
        # Resize to model input size while maintaining aspect ratio
        img_resized = img.convert('RGB')
        
        # RMBG-2.0 uses square inputs of 1024x1024
        img_resized = img_resized.resize((INPUT_SIZE, INPUT_SIZE), Image.LANCZOS)
        
        # Convert to numpy array and normalize
        img_np = np.array(img_resized, dtype=np.float32) / 255.0
        
        # Transpose to NCHW format (batch, channels, height, width)
        img_np = img_np.transpose(2, 0, 1)
        img_np = np.expand_dims(img_np, axis=0)
        
        return img_np

    def _inference(self, img_input):
        """Run inference on the preprocessed image"""
        try:
            outputs = self.ort_session.run(
                None, 
                {self.input_name: img_input}
            )
            return outputs[0]
        except Exception as e:
            print(f"Inference error: {e}")
            raise

    def _postprocess(self, mask, original_size):
        """Postprocess the model output to create the final mask"""
        # Squeeze dimensions and get the mask
        mask = mask.squeeze()
        
        # Resize mask to original image size
        mask = Image.fromarray((mask * 255).astype(np.uint8))
        mask = mask.resize(original_size, Image.LANCZOS)
        
        return mask

def download_image(url, timeout=10):
    """Download image from URL"""
    try:
        if url.startswith(('http://', 'https://')):
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return Image.open(BytesIO(response.content))
        else:
            return Image.open(url)
    except Exception as e:
        print(f"Error downloading image: {e}")
        raise

def process_image(image_path, output_path=None, alpha_matting=False, foreground_threshold=240, 
                  background_threshold=10, model_path=None):
    """Process an image to remove the background"""
    try:
        # Initialize the model
        model = RMBG2(model_path)
        
        # Load the image (from file or URL)
        if isinstance(image_path, str):
            if image_path.startswith(('http://', 'https://')):
                img = download_image(image_path)
            else:
                if not os.path.isfile(image_path):
                    raise FileNotFoundError(f"Image file not found: {image_path}")
                img = Image.open(image_path)
        else:
            # Assume it's already a PIL Image
            img = image_path
            
        # Convert RGBA to RGB if needed
        if img.mode == 'RGBA':
            img_rgb = Image.new('RGB', img.size, (255, 255, 255))
            img_rgb.paste(img, mask=img.split()[3])
            img = img_rgb
            
        # Get original image size
        orig_width, orig_height = img.size
        print(f"Processing image of size {orig_width}x{orig_height}")
        
        # Generate the mask
        mask = model.predict(img)
        
        # Create output image with transparency
        output = Image.new('RGBA', img.size, (0, 0, 0, 0))
        output.paste(img, (0, 0), mask)
        
        # Save the result if output path is specified
        if output_path:
            dirname = os.path.dirname(output_path)
            if dirname and not os.path.exists(dirname):
                os.makedirs(dirname)
            output.save(output_path, format='PNG')
            print(f"Saved output to {output_path}")
            
            # Also save the mask for debugging
            mask_path = os.path.splitext(output_path)[0] + "_mask.png"
            mask.save(mask_path, format='PNG')
            print(f"Saved mask to {mask_path}")
            
        return output, mask
    except Exception as e:
        print(f"Error processing image: {e}")
        raise

def main():
    parser = argparse.ArgumentParser(description='Remove background from images using RMBG-2.0 model')
    parser.add_argument('--input', '-i', type=str, required=True, help='Path to input image or URL')
    parser.add_argument('--output', '-o', type=str, default=None, help='Path to output image')
    parser.add_argument('--model', '-m', type=str, default=None, help='Path to ONNX model')
    args = parser.parse_args()
    
    if not args.output:
        args.output = os.path.splitext(args.input)[0] + "_nobg.png"
        
    try:
        process_image(args.input, args.output, model_path=args.model)
        print("Background removal completed successfully")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 