# Creates an MD file for every elemnt in a tree json with matching description name

import json
import os
import argparse
import sys

def create_description_files(tree_data, output_dir):
    """Recursively traverses the tree and creates markdown files."""
    created_count = 0
    skipped_count = 0
    nodes_processed = 0

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    nodes_to_process = []
    if isinstance(tree_data, list):
        nodes_to_process.extend(tree_data)
    elif isinstance(tree_data, dict):
         # Handle case where root might be a single object instead of array
         # Or if called on a child node directly
        nodes_to_process.append(tree_data)

    processed_names = set() # Keep track of names to avoid duplicates if structure allows

    while nodes_to_process:
        node = nodes_to_process.pop(0)
        nodes_processed += 1

        if 'name' not in node:
            print(f"Warning: Node found without a 'name' field: {node}", file=sys.stderr)
            continue

        component_name = node['name']

        # Avoid processing the same name multiple times if it appears in different branches
        # (Though typically names should be unique identifiers)
        if component_name in processed_names:
            continue
        processed_names.add(component_name)

        # Construct the full path for the markdown file
        # Replace potentially problematic characters for filenames if necessary
        # For now, assume names are filesystem-safe
        filename = f"{component_name}.md"
        filepath = os.path.join(output_dir, filename)

        # Check if the file already exists
        if not os.path.exists(filepath):
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    # Write a basic placeholder title
                    f.write(f"# {component_name}\n\n")
                    f.write("*(Description needed...)*\n\n")
                    # Add example placeholders for common sections
                    f.write("## Overview\n\n")
                    f.write("## Usage\n\n```rust\n// Example Rust code here\n```\n\n")
                    f.write("## See Also\n\n")
                print(f"Created: {filepath}")
                created_count += 1
            except OSError as e:
                print(f"Error creating file {filepath}: {e}", file=sys.stderr)
                skipped_count += 1
        else:
            # print(f"Skipped (already exists): {filepath}") # Optional: uncomment for verbose output
            skipped_count += 1

        # Process children recursively
        if 'children' in node and isinstance(node['children'], list):
            nodes_to_process.extend(node['children']) # Add children to the processing queue

    return created_count, skipped_count, nodes_processed

def main():
    parser = argparse.ArgumentParser(description="Generate empty Markdown description files from a JSON tree structure.")
    parser.add_argument("tree_file", help="Path to the JSON tree file (e.g., whip-docs/trees/vulkan_2d_rendering.json)")
    parser.add_argument("-o", "--output-dir", default="whip-docs/descriptions",
                        help="Directory to create the markdown files in (default: whip-docs/descriptions)")

    args = parser.parse_args()

    if not os.path.exists(args.tree_file):
        print(f"Error: Tree file not found at '{args.tree_file}'", file=sys.stderr)
        sys.exit(1)

    try:
        with open(args.tree_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from '{args.tree_file}': {e}", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"Error reading file '{args.tree_file}': {e}", file=sys.stderr)
        sys.exit(1)

    if 'tree' not in data or not isinstance(data['tree'], list):
        print(f"Error: JSON file '{args.tree_file}' must contain a top-level 'tree' array.", file=sys.stderr)
        sys.exit(1)

    print(f"Processing tree file: {args.tree_file}")
    print(f"Output directory: {args.output_dir}")

    created, skipped, processed = create_description_files(data['tree'], args.output_dir)

    print("\n--- Summary ---")
    print(f"Nodes processed: {processed}")
    print(f"Files created: {created}")
    print(f"Files skipped (already existed): {skipped}")
    print("Done.")

if __name__ == "__main__":
    main()