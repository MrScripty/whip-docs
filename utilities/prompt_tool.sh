#!/bin/bash

# Dynamically determine the base directory based on the script's location
# Assumes this script is in a 'scripts' subdirectory of the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# --- Define paths relative to BASE_DIR ---
ROOT_FILES=("$BASE_DIR/index.html" "$BASE_DIR/script.js") # Add other root files if needed
WEB_PAGES_DIR="$BASE_DIR/web-pages"
WHIP_DOCS_DIR="$BASE_DIR/whip-docs"
TREES_DIR="$WHIP_DOCS_DIR/trees"
DESCRIPTIONS_DIR="$WHIP_DOCS_DIR/descriptions"
UTILITIES_DIR="$BASE_DIR/utilities" # Added for prompts
BOT_DOCS_DIR="$BASE_DIR/bot-docs" # Added for bot-docs

# --- Create temporary files ---
temp_file=$(mktemp)
# file_list is created only when needed (option 4 or 5)

# --- Function to append content, with conditional code block markup ---
append_content() {
    local filepath="$1"
    local filetype="$2" # Determined by extension
    local display_path="${filepath#$BASE_DIR/}" # Path relative to project root

    # Write the relative file path above the content
    echo "$display_path" >> "$temp_file" # MODIFIED: Output just the relative path
    echo "" >> "$temp_file" # Keep a blank line for separation before the code block

    # Determine language hint for code blocks
    local lang_hint="$filetype"
    if [[ "$filetype" == "js" ]]; then
        lang_hint="javascript"
    elif [[ "$filetype" == "md" ]]; then
        lang_hint="markdown"
    elif [[ "$filetype" == "sh" ]]; then
        lang_hint="shell"
    elif [[ "$filetype" == "css" ]]; then
        lang_hint="css"
    elif [[ "$filetype" == "html" ]]; then
        lang_hint="html"
    elif [[ "$filetype" == "json" ]]; then
        lang_hint="json"
    fi

    # For all files, use code blocks with language hints
    # This change ensures .md files are also wrapped in ```markdown ... ```
    echo "\`\`\`$lang_hint" >> "$temp_file"
    cat "$filepath" >> "$temp_file"
    # Add a newline before closing backticks if file doesn't end with one
    [[ $(tail -c1 "$filepath" | wc -l) -eq 0 ]] && echo >> "$temp_file"
    echo "\`\`\`" >> "$temp_file"

    # Add a blank line after each file's content for separation
    echo "" >> "$temp_file"
}

# --- Function to process a list of files ---
process_file_list() {
    local list_file="$1"
    local first_file=true # Not currently used, but kept for potential future use

    while IFS= read -r file; do
        if [ -f "$file" ]; then # Ensure file exists
            local extension="${file##*.}"
            local file_type="$extension" # Default type is the extension

            # Skip files without extensions or specific unwanted types if needed
            if [[ -z "$extension" ]]; then
                echo "Skipping file without extension: $file"
                continue
            fi

            echo "Processing ${file#$BASE_DIR/}"
            append_content "$file" "$file_type"
            first_file=false
        else
            echo "Warning: File not found in list: $file"
        fi
    done < "$list_file"
}


# --- CLI Interface ---
echo "Website Context Aggregator"
echo "Base Directory: $BASE_DIR"
echo "--------------------------------"
echo "Choose an option:"
echo "1) Core Context (HTML structure, CSS, JS, Tree JSON)"
echo "2) All Web Files (HTML, CSS, JS)"
echo "3) AI Documentation Context (documentation_prompt.md, architecture.md, modules.md)"
echo "4) All Project Files (Web + Docs + Bot Docs + Prompts)"
echo "5) Custom File List"
read -p "Enter option (1-5): " option

# --- Process files based on user option ---
case "$option" in
    1) # Core Context
        echo "Gathering Core Context..."
        core_list_temp_file=$(mktemp)
        # Add root files
        printf "%s\n" "${ROOT_FILES[@]}" >> "$core_list_temp_file"
        # Add web page files
        find "$WEB_PAGES_DIR" -maxdepth 1 \( -name "*.html" -o -name "*.css" -o -name "*.js" \) -type f >> "$core_list_temp_file"
        # Add tree definition file(s)
        find "$TREES_DIR" -maxdepth 1 -name "*.json" -type f >> "$core_list_temp_file"
        # Sort for consistency
        sort "$core_list_temp_file" -o "$core_list_temp_file"
        process_file_list "$core_list_temp_file"
        rm "$core_list_temp_file"
        ;;

    2) # All Web Files
        echo "Gathering All Web Files..."
        web_list_temp_file=$(mktemp)
        # Add root JS
         printf "%s\n" "$BASE_DIR/script.js" >> "$web_list_temp_file"
        # Add web pages dir files
        find "$WEB_PAGES_DIR" \( -name "*.html" -o -name "*.css" -o -name "*.js" \) -type f >> "$web_list_temp_file"
        sort "$web_list_temp_file" -o "$web_list_temp_file"
        process_file_list "$web_list_temp_file"
        rm "$web_list_temp_file"
        ;;

    3) # AI Documentation Context
        echo "Gathering AI Documentation Context..."
        ai_doc_list_temp_file=$(mktemp)
        # Add the documentation prompt
        if [ -f "$UTILITIES_DIR/prompts/generate_documentation.md" ]; then
            echo "$UTILITIES_DIR/prompts/generate_documentation.md" >> "$ai_doc_list_temp_file"
        else
            echo "Warning: $UTILITIES_DIR/prompts/generate_documentation.md not found."
        fi
        # Add architecture.md
        if [ -f "$BOT_DOCS_DIR/architecture.md" ]; then
            echo "$BOT_DOCS_DIR/architecture.md" >> "$ai_doc_list_temp_file"
        else
            echo "Warning: $BOT_DOCS_DIR/architecture.md not found."
        fi
        # Add modules.md
        if [ -f "$BOT_DOCS_DIR/modules.md" ]; then
            echo "$BOT_DOCS_DIR/modules.md" >> "$ai_doc_list_temp_file"
        else
            echo "Warning: $BOT_DOCS_DIR/modules.md not found."
        fi
        # No need to sort a fixed list of 3 files if order is intentional,
        # but sorting won't hurt if we want alphabetical.
        # For now, keep the specified order.
        process_file_list "$ai_doc_list_temp_file"
        rm "$ai_doc_list_temp_file"
        ;;

    4) # All Project Files
        echo "Gathering All Project Files..."
        all_list_temp_file=$(mktemp)
         # Add root files
        printf "%s\n" "${ROOT_FILES[@]}" >> "$all_list_temp_file"
        # Add web pages dir files
        find "$WEB_PAGES_DIR" \( -name "*.html" -o -name "*.css" -o -name "*.js" \) -type f >> "$all_list_temp_file"
         # Add docs dir files (JSONs and MDs)
        find "$WHIP_DOCS_DIR" \( -name "*.json" -o -name "*.md" \) -type f >> "$all_list_temp_file"
        # Add bot-docs dir files (MDs)
        find "$BOT_DOCS_DIR" -name "*.md" -type f >> "$all_list_temp_file"
        # Add utilities/prompts dir files (MDs)
        find "$UTILITIES_DIR/prompts" -name "*.md" -type f >> "$all_list_temp_file"
        sort "$all_list_temp_file" -o "$all_list_temp_file"
        process_file_list "$all_list_temp_file"
        rm "$all_list_temp_file"
        ;;

    5) # Custom File List
        echo "Enter space-separated file paths (relative to $BASE_DIR or absolute):"
        read -ra custom_files_array # Read into an array

        custom_list_temp_file=$(mktemp)
        for file_path_item in "${custom_files_array[@]}"; do
            # Try to resolve relative paths from BASE_DIR
            resolved_path_item=""
            if [[ "$file_path_item" == /* ]]; then # Absolute path
                resolved_path_item="$file_path_item"
            else # Relative path
                resolved_path_item="$BASE_DIR/$file_path_item"
            fi

            if [ -f "$resolved_path_item" ]; then
                echo "$resolved_path_item" >> "$custom_list_temp_file"
            else
                 echo "Warning: Custom file not found: $file_path_item (Resolved: $resolved_path_item)"
            fi
        done
        sort "$custom_list_temp_file" -o "$custom_list_temp_file"
        process_file_list "$custom_list_temp_file"
        rm "$custom_list_temp_file"
        ;;

    *)
        echo "Invalid option."
        rm "$temp_file" # Clean up temp file
        exit 1
        ;;
esac

# --- Add final instructions if content was added ---
if [ -s "$temp_file" ]; then
    echo "" >> "$temp_file" # Ensure trailing newline for clipboard
else
    echo "No content generated for the selected option."
    rm "$temp_file"
    exit 0
fi

# --- Attempt to copy to clipboard (Cross-platform) ---
clipboard_command=""
if command -v xclip >/dev/null 2>&1; then
    clipboard_command="xclip -selection clipboard"
elif command -v xsel >/dev/null 2>&1; then
    clipboard_command="xsel --clipboard --input"
elif command -v pbcopy >/dev/null 2>&1; then # macOS
    clipboard_command="pbcopy"
elif command -v clip.exe >/dev/null 2>&1; then # Windows/WSL
    clipboard_command="clip.exe"
fi

if [ -n "$clipboard_command" ]; then
    cat "$temp_file" | $clipboard_command
    if [ $? -eq 0 ]; then
        echo "Success: Content copied to clipboard using '$clipboard_command'."
        # Optional: Save a copy for debugging
        # cp "$temp_file" /tmp/website_clipboard_output.txt
        # echo "Clipboard content saved to /tmp/website_clipboard_output.txt for verification."
    else
        echo "Error: Failed to copy using '$clipboard_command'. Content saved to $temp_file."
    fi
else
    echo "Warning: No clipboard command (xclip, xsel, pbcopy, clip.exe) found."
    echo "Content saved to $temp_file."
fi

# --- Clean up ---
rm "$temp_file"

echo "Script finished."