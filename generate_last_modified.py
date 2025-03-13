#!/usr/bin/env python3
"""
Script to generate last-modified.json file for the website.
Run this script before pushing updates to your repository.

Usage: python generate_last_modified.py
"""

import os
import json
import time
from datetime import datetime

# Configuration - define directories to track
directories = [
    '.',  # Root directory
    './projects',
    './playground',
    './cv'
]

# File extensions to track
track_extensions = [
    '.html',
    '.css',
    '.js',
    '.jpg',
    '.png',
    '.svg'
]

# Directories to ignore
ignore_dirs = [
    'node_modules',
    '.git',
    '__pycache__',
    '.idea',
    '.vscode'
]

def should_track_file(filename):
    """Check if we should track this file based on its extension."""
    _, ext = os.path.splitext(filename.lower())
    return ext in track_extensions

def get_all_files(dir_path):
    """Recursively get all files in a directory that match our criteria."""
    files_list = []
    
    for root, dirs, files in os.walk(dir_path):
        # Skip ignored directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
        
        for file in files:
            if should_track_file(file):
                files_list.append(os.path.join(root, file))
    
    return files_list

def main():
    """Generate the last-modified.json file."""
    modified_data = {}
    
    for directory in directories:
        try:
            files = get_all_files(directory)
            latest_modified = 0
            
            for file in files:
                try:
                    # Get file modification time in milliseconds (JavaScript timestamp format)
                    mod_time = os.path.getmtime(file) * 1000
                    if mod_time > latest_modified:
                        latest_modified = mod_time
                except Exception as e:
                    print(f"Error getting modification time for {file}: {e}")
            
            # Store the timestamp for this directory
            dir_key = 'root' if directory == '.' else directory.replace('./', '')
            modified_data[dir_key] = int(latest_modified)
            
            # Format date for display in console
            formatted_date = datetime.fromtimestamp(latest_modified / 1000).strftime('%Y-%m-%d %H:%M:%S')
            print(f"Latest modification in {directory}: {formatted_date}")
        
        except Exception as e:
            print(f"Error processing directory {directory}: {e}")
    
    # Write to JSON file
    try:
        with open('last-modified.json', 'w') as json_file:
            json.dump(modified_data, json_file, indent=2)
        print("Successfully generated last-modified.json")
    except Exception as e:
        print(f"Error writing last-modified.json: {e}")

if __name__ == "__main__":
    main()