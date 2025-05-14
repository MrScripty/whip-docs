#!/bin/bash

# Dynamically determine the base directory based on the script's location
# Assumes this script is in a 'utilities' subdirectory of the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# --- Define paths relative to BASE_DIR ---
UTILITIES_DIR="$BASE_DIR/utilities"
BOT_DOCS_DIR="$BASE_DIR/bot-docs"
# Define WHIP_DOCS_DESCRIPTIONS_DIR for clarity in Option 1 exclusions
WHIP_DOCS_DESCRIPTIONS_DIR="$BASE_DIR/whip-docs/descriptions"


# --- Create temporary files ---
temp_file=$(mktemp)
all_project_files_list_temp="" 
files_to_process_temp=""

cleanup_temp_files() {
    rm -f "$temp_file"
    [[ -n "$all_project_files_list_temp" && -f "$all_project_files_list_temp" ]] && rm -f "$all_project_files_list_temp"
    [[ -n "$files_to_process_temp" && -f "$files_to_process_temp" ]] && rm -f "$files_to_process_temp"
}
trap cleanup_temp_files EXIT INT TERM

# --- Function to append content, with language hint for code blocks ---
append_content() {
    local filepath="$1"
    local lang_hint="$2" 
    local display_path="${filepath#$BASE_DIR/}" 

    echo "$display_path" >> "$temp_file"
    echo "" >> "$temp_file" 

    echo "\`\`\`\`$lang_hint" >> "$temp_file"
    cat "$filepath" >> "$temp_file"
    [[ $(tail -c1 "$filepath" | wc -l) -eq 0 ]] && echo >> "$temp_file"
    echo "\`\`\`\`" >> "$temp_file"
    #echo "" >> "$temp_file"
}

# --- Function to process a list of files ---
process_file_list() {
    local list_file="$1"

    while IFS= read -r file; do
        if [ -f "$file" ]; then 
            local filename=$(basename -- "$file")
            local extension="${filename##*.}" 
            local lang_hint

            if [[ "$filename" == "$extension" ]] || [[ -z "$extension" ]]; then 
                case "$filename" in
                    "Makefile"|"makefile") lang_hint="makefile" ;;
                    "Dockerfile"|"dockerfile") lang_hint="dockerfile" ;;
                    *) lang_hint="text" ;; 
                esac
            else 
                case "$extension" in
                    "js") lang_hint="javascript" ;;
                    "md") lang_hint="markdown" ;;
                    "css") lang_hint="css" ;;
                    "html") lang_hint="html" ;;
                    "json") lang_hint="json" ;;
                    "py") lang_hint="python" ;;
                    "rb") lang_hint="ruby" ;;
                    "java") lang_hint="java" ;;
                    "c") lang_hint="c" ;;
                    "cpp"|"cxx"|"hpp"|"hxx") lang_hint="cpp" ;;
                    "cs") lang_hint="csharp" ;;
                    "go") lang_hint="go" ;;
                    "php") lang_hint="php" ;;
                    "rs") lang_hint="rust" ;;
                    "toml") lang_hint="toml" ;;
                    "yaml"|"yml") lang_hint="yaml" ;;
                    "xml") lang_hint="xml" ;;
                    "sql") lang_hint="sql" ;;
                    "ts") lang_hint="typescript" ;;
                    "gitignore") lang_hint="text" ;; 
                    "bashrc"|"zshrc"|"profile"|"sh") lang_hint="shell" ;; 
                    "vimrc") lang_hint="vim" ;; 
                    *) lang_hint="$extension" ;; 
                esac
            fi
            
            echo "Processing ${file#$BASE_DIR/}"
            append_content "$file" "$lang_hint"
        else
            echo "Warning: File not found in list: $file"
        fi
    done < "$list_file"
}

# --- Pre-fetch all non-ignored project files ---
all_project_files_list_temp=$(mktemp)
if (cd "$BASE_DIR" && git rev-parse --is-inside-work-tree > /dev/null 2>&1); then
    (cd "$BASE_DIR" && git ls-files --cached --others --exclude-standard -z | while IFS= read -r -d $'\0' file_rel_path; do echo "$BASE_DIR/$file_rel_path"; done) > "$all_project_files_list_temp"
    if [ ! -s "$all_project_files_list_temp" ]; then
        echo "Info: 'git ls-files' found no files. This might be a new or empty repository, or all files are ignored."
    fi
else
    echo "Warning: Not inside a Git repository or 'git' command not found."
    echo "Falling back to 'find' for all files. .gitignore rules will NOT be applied."
    # Refine find to exclude .git directory if git is not used
    if [ -d "$BASE_DIR/.git" ]; then
        find "$BASE_DIR" -path "$BASE_DIR/.git" -prune -o -type f -print > "$all_project_files_list_temp"
    else
        find "$BASE_DIR" -type f > "$all_project_files_list_temp"
    fi
fi

# --- CLI Interface ---
echo "Context Aggregator"
echo "Base Directory: $BASE_DIR"
echo "--------------------------------"
echo "Choose an option:"
echo "1) All Files"
echo "2) All Web Files"
echo "3) All rust-doc-tool files"
echo "4) All AI Documentation"
echo "5) Generate AI Docs"
echo "6) Custom File List"
read -p "Enter option (1-6): " option

files_to_process_temp=$(mktemp) 

# --- Process files based on user option ---
case "$option" in
    1) # All Files (with exclusions)
        echo "Gathering All Files (with specific exclusions)..."
        
        # Define patterns for exclusion. Paths must be absolute for matching against all_project_files_list_temp
        # These are now script-level variables, but their use is contained within this case block.
        exclude_descriptions_md_pattern="^${WHIP_DOCS_DESCRIPTIONS_DIR}/.*\.md$"
        exclude_readme_pattern="^${BASE_DIR}/\README.md$" # Matches README or README.md at root
        exclude_gitignore_pattern="^${BASE_DIR}/\.gitignore$" # Matches .gitignore at root
        exclude_license_pattern="^${BASE_DIR}/\LICENSE$"

        # Filter the all_project_files_list_temp
        grep -vE "$exclude_descriptions_md_pattern" "$all_project_files_list_temp" | \
        grep -vE "$exclude_readme_pattern" | \
        grep -vE "$exclude_license_pattern" | \
        grep -vE "$exclude_gitignore_pattern" > "$files_to_process_temp"
        
        sort "$files_to_process_temp" -o "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    2) # All Web Files (.js, .html, .json, .css)
        echo "Gathering All Web Files..."
        grep -E '\.(js|html|json|css)$' "$all_project_files_list_temp" > "$files_to_process_temp"
        sort "$files_to_process_temp" -o "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    3) # All rust-doc-tool files (.rs, .toml)
        echo "Gathering All rust-doc-tool files..."
        grep -E '\.(rs|toml)$' "$all_project_files_list_temp" > "$files_to_process_temp"
        sort "$files_to_process_temp" -o "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    4) # All AI Documentation (.md in /bot-docs)
        echo "Gathering All AI Documentation files from $BOT_DOCS_DIR..."
        > "$files_to_process_temp" 
        while IFS= read -r file_path; do
            if [[ "$file_path" == "$BOT_DOCS_DIR"/*.md ]]; then
                echo "$file_path" >> "$files_to_process_temp"
            fi
        done < "$all_project_files_list_temp"
        sort "$files_to_process_temp" -o "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    5) # Generate AI Docs (Option 4 + specific prompt)
        echo "Gathering files for AI Doc Generation..."
        > "$files_to_process_temp" 
        while IFS= read -r file_path; do
            if [[ "$file_path" == "$BOT_DOCS_DIR"/*.md ]]; then
                echo "$file_path" >> "$files_to_process_temp"
            fi
        done < "$all_project_files_list_temp"

        prompt_file_path="$UTILITIES_DIR/prompts/generate_documentation.md"
        if [ -f "$prompt_file_path" ]; then
            echo "$prompt_file_path" >> "$files_to_process_temp"
        else
            echo "Warning: Prompt file $prompt_file_path not found."
        fi
        
        sort "$files_to_process_temp" | uniq > "${files_to_process_temp}.sorted_uniq"
        mv "${files_to_process_temp}.sorted_uniq" "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    6) # Custom File List
        echo "Enter space-separated file paths (relative to $BASE_DIR or absolute):"
        read -ra custom_files_array 

        > "$files_to_process_temp" 
        for file_path_item in "${custom_files_array[@]}"; do
            resolved_path_item=""
            if [[ "$file_path_item" == /* ]]; then 
                resolved_path_item="$file_path_item"
            else 
                resolved_path_item="$BASE_DIR/$file_path_item"
            fi

            normalized_path_item="$resolved_path_item" # Default
            if command -v realpath &> /dev/null; then
                 normalized_path_item_temp=$(realpath -m "$resolved_path_item" 2>/dev/null)
                 if [ $? -eq 0 ]; then
                    normalized_path_item="$normalized_path_item_temp"
                 fi
            fi


            if [ -f "$normalized_path_item" ]; then
                is_ignored=false
                if [[ "$normalized_path_item" == "$BASE_DIR"* ]] && \
                   (cd "$BASE_DIR" && git rev-parse --is-inside-work-tree > /dev/null 2>&1); then
                    if (cd "$BASE_DIR" && git check-ignore -q "$normalized_path_item"); then
                        is_ignored=true
                    fi
                fi

                if $is_ignored; then
                    echo "Warning: Custom file '$file_path_item' (Resolved: $normalized_path_item) is ignored by .gitignore and will be skipped."
                else
                    echo "$normalized_path_item" >> "$files_to_process_temp"
                fi
            else
                 echo "Warning: Custom file not found: $file_path_item (Resolved: $normalized_path_item)"
            fi
        done
        sort "$files_to_process_temp" | uniq > "${files_to_process_temp}.sorted_uniq"
        mv "${files_to_process_temp}.sorted_uniq" "$files_to_process_temp"
        process_file_list "$files_to_process_temp"
        ;;

    *)
        echo "Invalid option."
        exit 1
        ;;
esac

# --- Add final instructions if content was added ---
if [ -s "$temp_file" ]; then
    echo "" >> "$temp_file" 
else
    echo "No content generated for the selected option."
    exit 0 
fi

# --- Attempt to copy to clipboard (Cross-platform) ---
clipboard_command=""
if command -v xclip >/dev/null 2>&1; then
    clipboard_command="xclip -selection clipboard"
elif command -v xsel >/dev/null 2>&1; then
    clipboard_command="xsel --clipboard --input"
elif command -v pbcopy >/dev/null 2>&1; then 
    clipboard_command="pbcopy"
elif command -v clip.exe >/dev/null 2>&1; then 
    clipboard_command="clip.exe"
fi

if [ -n "$clipboard_command" ]; then
    cat "$temp_file" | $clipboard_command
    if [ $? -eq 0 ]; then
        echo "Success: Content copied to clipboard using '$clipboard_command'."
    else
        echo "Error: Failed to copy using '$clipboard_command'. Content saved to $temp_file (will be cleaned up on exit)."
        echo "You can manually copy from: $temp_file"
        read -p "Press Enter to continue and clean up temporary files..."
    fi
else
    echo "Warning: No clipboard command (xclip, xsel, pbcopy, clip.exe) found."
    echo "Content saved to $temp_file (will be cleaned up on exit)."
    echo "You can manually copy from: $temp_file"
    read -p "Press Enter to continue and clean up temporary files..."
fi

echo "Script finished."