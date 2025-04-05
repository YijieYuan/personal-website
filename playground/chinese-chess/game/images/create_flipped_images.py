import os
import re
from PIL import Image

def rotate_png_files(source_dir, dest_dir):
    """
    Rotates all PNG images in source_dir by 180 degrees and saves them to dest_dir.
    """
    # Create destination directory if it doesn't exist
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        print(f"Created directory: {dest_dir}")
    
    # Get all PNG files in the source directory
    png_files = [f for f in os.listdir(source_dir) if f.lower().endswith('.png')]
    
    if not png_files:
        print(f"No PNG files found in {source_dir}")
    else:
        print(f"Found {len(png_files)} PNG files to process")
        
        # Process each PNG file
        for filename in png_files:
            source_path = os.path.join(source_dir, filename)
            dest_path = os.path.join(dest_dir, filename)
            
            try:
                # Open image, rotate 180 degrees, and save
                with Image.open(source_path) as img:
                    rotated_img = img.rotate(180)
                    rotated_img.save(dest_path)
                    print(f"Rotated and saved PNG: {filename}")
            except Exception as e:
                print(f"Error processing PNG {filename}: {str(e)}")

def rotate_svg_files(source_dir, dest_dir):
    """
    Rotates all SVG images in source_dir by 180 degrees and saves them to dest_dir.
    Uses a transform attribute to rotate the SVG.
    """
    # Create destination directory if it doesn't exist
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        print(f"Created directory: {dest_dir}")
    
    # Get all SVG files in the source directory
    svg_files = [f for f in os.listdir(source_dir) if f.lower().endswith('.svg')]
    
    if not svg_files:
        print(f"No SVG files found in {source_dir}")
    else:
        print(f"Found {len(svg_files)} SVG files to process")
        
        # Process each SVG file
        for filename in svg_files:
            source_path = os.path.join(source_dir, filename)
            dest_path = os.path.join(dest_dir, filename)
            
            try:
                # Read SVG content
                with open(source_path, 'r', encoding='utf-8') as file:
                    svg_content = file.read()
                
                # Find the svg tag
                svg_tag_match = re.search(r'<svg[^>]*>', svg_content)
                if svg_tag_match:
                    svg_tag = svg_tag_match.group(0)
                    
                    # Extract width and height if present
                    width_match = re.search(r'width="([^"]*)"', svg_tag)
                    height_match = re.search(r'height="([^"]*)"', svg_tag)
                    
                    width = width_match.group(1) if width_match else None
                    height = height_match.group(1) if height_match else None
                    
                    # Add or update transform attribute for 180-degree rotation
                    if 'transform=' in svg_tag:
                        # If transform already exists, add rotation
                        new_svg_tag = re.sub(
                            r'transform="([^"]*)"', 
                            r'transform="\1 rotate(180, ' + (width or '24') + '/2, ' + (height or '24') + '/2)"', 
                            svg_tag
                        )
                    else:
                        # If no transform exists, add one with rotation
                        new_svg_tag = svg_tag.replace(
                            '>', 
                            f' transform="rotate(180, {width or "24"}/2, {height or "24"}/2)">'
                        )
                    
                    # Replace the old svg tag with the new one
                    new_svg_content = svg_content.replace(svg_tag, new_svg_tag)
                    
                    # Write the updated SVG to the destination
                    with open(dest_path, 'w', encoding='utf-8') as file:
                        file.write(new_svg_content)
                    
                    print(f"Rotated and saved SVG: {filename}")
                else:
                    print(f"Could not find SVG tag in {filename}")
            except Exception as e:
                print(f"Error processing SVG {filename}: {str(e)}")

def check_and_fix_ccbridge_parameter():
    """
    Checks the xiangqi.js file to ensure isCCBridge is correctly determined
    """
    xiangqi_js_path = "game/xiangqi.js"
    
    try:
        if os.path.exists(xiangqi_js_path):
            with open(xiangqi_js_path, 'r', encoding='utf-8') as file:
                content = file.read()
                
            # Check how isCCBridge is determined
            if 'let isCCBridge = document.getElementById' in content:
                print("Found isCCBridge check in xiangqi.js")
                
                # Print debug advice
                print("\nIMPORTANT: Make sure your board is using the CCBridge style")
                print("If your pieces aren't showing, check if the board has 'ccbridge' in its background URL")
                print("You can force PNG mode by adding this line before the drawBoard function:")
                print("  let isCCBridge = true;  // Force PNG mode\n")
    except Exception as e:
        print(f"Error checking xiangqi.js: {str(e)}")

if __name__ == "__main__":
    # Path configuration - modify these paths as needed
    source_directory = r"D:\personal-website\playground\chinese-chess\game\images\traditional_pieces"
    dest_directory = r"D:\personal-website\playground\chinese-chess\game\images\flipped_pieces"
    
    # Rotate both PNG and SVG files
    rotate_png_files(source_directory, dest_directory)
    rotate_svg_files(source_directory, dest_directory)
    
    # Check the xiangqi.js file for potential issues
    check_and_fix_ccbridge_parameter()
    
    print("\nAll operations completed!")