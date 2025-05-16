// scripts/ui/commit-viewer-header.js

// CONSTANTS for the script (can be defined outside the event listener)
const GITHUB_REPO_API_URL = "https://api.github.com/repos/MrScripty/Studio-Whip/commits";
const NUM_COMMITS_TO_DISPLAY = 15;

// --- HELPER FUNCTIONS (defined globally or within initCommitViewer) ---
function formatDateYYYYMMDD(date) {
    if (!(date instanceof Date) || isNaN(date)) return "Invalid Date";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Main initialization function for the commit viewer
async function initCommitViewer() {
    const placeholderId = 'header-commit-viewer-placeholder'; // This ID is INSIDE the loaded main-header.html
    const viewerHtmlPath = '../web-pages/components/commit-viewer-header.html';

    // DOM Element References
    let viewerContainer, singleCommitMessage, singleCommitDate, singleCommitShaCollapsed,
        scrollWrapper, commitListUl, toggleButton,
        notesDropdown, notesDropdownContent;

    // STATE VARIABLES
    let placeholderElement = document.getElementById(placeholderId);

    let commitsData = [];
    let selectedCommit = null;
    let latestCommit = null;
    let isExpanded = false;
    let isDragging = false;
    let startX, scrollLeftStart;
    let notesHideTimeout = null;
    let originalPlaceholderLeftOffset = 0;
    let mainHeaderElement = null; // Will be the actual .main-header element

    if (!placeholderElement) {
        console.error(`Commit viewer placeholder (#${placeholderId}) NOT FOUND after main header loaded. Script cannot proceed.`);
        return;
    }
    console.log("Commit viewer placeholder found:", placeholderElement);


    async function fetchCommits() {
        try {
            const response = await fetch(`${GITHUB_REPO_API_URL}?per_page=${NUM_COMMITS_TO_DISPLAY}`);
            if (!response.ok) {
                if (response.status === 403) {
                    console.warn("GitHub API rate limit exceeded for header commit viewer.");
                    if (singleCommitMessage) singleCommitMessage.textContent = "API Rate Limit";
                    if (singleCommitDate) singleCommitDate.textContent = "";
                    if (singleCommitShaCollapsed) singleCommitShaCollapsed.textContent = "";
                } else {
                    console.error(`GitHub API error: ${response.statusText} (Status: ${response.status})`);
                    if (singleCommitMessage) singleCommitMessage.textContent = "Error loading commits";
                }
                return [];
            }
            const data = await response.json();
            return data.map(entry => ({
                sha: entry.sha,
                fullMessage: entry.commit.message,
                message: entry.commit.message.split('\n')[0],
                date: new Date(entry.commit.author.date),
                url: entry.html_url,
                author: entry.commit.author.name
            }));
        } catch (error) {
            console.error("Error fetching commits for header viewer:", error);
            if (singleCommitMessage) singleCommitMessage.textContent = "Error loading commits";
            if (singleCommitDate) singleCommitDate.textContent = "";
            if (singleCommitShaCollapsed) singleCommitShaCollapsed.textContent = "";
            return [];
        }
    }

    function renderSingleCommitDisplay() {
        const commitToShow = selectedCommit || latestCommit;
        if (commitToShow && singleCommitMessage && singleCommitShaCollapsed && singleCommitDate) {
            singleCommitMessage.textContent = commitToShow.message;
            singleCommitMessage.title = `Message: ${commitToShow.message}\nAuthor: ${commitToShow.author}\nSHA: ${commitToShow.sha.substring(0,7)}`;
            singleCommitShaCollapsed.textContent = commitToShow.sha.substring(0, 7);
            singleCommitDate.textContent = formatDateYYYYMMDD(commitToShow.date);
        } else if (singleCommitMessage && singleCommitShaCollapsed && singleCommitDate) {
            singleCommitMessage.textContent = commitsData.length > 0 ? "Select a commit" : "No commits";
            singleCommitShaCollapsed.textContent = "";
            singleCommitDate.textContent = "";
        }
    }

    function renderCommitList() {
        if (!commitListUl) return;
        commitListUl.innerHTML = '';
        commitsData.forEach((commit, index) => {
            const li = document.createElement('li');
            li.className = 'hcv-commit-item';
            if (selectedCommit && commit.sha === selectedCommit.sha) {
                li.classList.add('hcv-selected');
            }
            li.dataset.sha = commit.sha;
            li.title = `Commit by ${commit.author} on ${formatDateYYYYMMDD(commit.date)}\nSHA: ${commit.sha}\n"${commit.message}"\n(Click to select & copy SHA)`;

            const numberDiv = document.createElement('div');
            numberDiv.className = 'hcv-commit-number';
            numberDiv.textContent = `#${index + 1}`;

            const textContentDiv = document.createElement('div');
            textContentDiv.className = 'hcv-commit-item-text-content';

            const messageDiv = document.createElement('div');
            messageDiv.className = 'hcv-commit-message';
            messageDiv.textContent = commit.message;

            const footerDiv = document.createElement('div');
            footerDiv.className = 'hcv-commit-item-footer';

            const dateDiv = document.createElement('span');
            dateDiv.className = 'hcv-commit-date';
            dateDiv.textContent = formatDateYYYYMMDD(commit.date);

            const shaDiv = document.createElement('span');
            shaDiv.className = 'hcv-commit-sha';
            shaDiv.textContent = commit.sha.substring(0, 7);

            footerDiv.appendChild(dateDiv);
            footerDiv.appendChild(shaDiv);
            textContentDiv.appendChild(messageDiv);
            textContentDiv.appendChild(footerDiv);
            li.appendChild(numberDiv);
            li.appendChild(textContentDiv);

            li.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (isDragging && placeholderElement && placeholderElement.dataset.dragged === 'true') return;
                try {
                    await navigator.clipboard.writeText(commit.sha);
                } catch (err) {
                    console.warn('Failed to copy commit SHA:', err);
                }
                selectedCommit = commit;
                isExpanded = false;
                hideNotesDropdown();
                renderViewerState();
            });

            li.addEventListener('mouseenter', (e) => {
                if (isExpanded) {
                    showNotesDropdown(commit, e.currentTarget);
                }
            });
            li.addEventListener('mouseleave', () => {
                if (isExpanded) {
                    scheduleHideNotesDropdown();
                }
            });
            commitListUl.appendChild(li);
        });
    }

    function showNotesDropdown(commit, targetElement) {
        if (!notesDropdown || !notesDropdownContent || !viewerContainer) return;
        clearTimeout(notesHideTimeout);
        notesDropdownContent.textContent = commit.fullMessage;
        notesDropdown.style.display = 'block';
        const targetRect = targetElement.getBoundingClientRect();
        let top = targetRect.bottom + 2;
        let left = targetRect.left;
        notesDropdown.style.top = `${top}px`;
        notesDropdown.style.left = `${left}px`;
        const dropdownRect = notesDropdown.getBoundingClientRect();
        if (dropdownRect.right > window.innerWidth - 5) {
            notesDropdown.style.left = `${window.innerWidth - dropdownRect.width - 5}px`;
        }
        if (dropdownRect.left < 5) {
            notesDropdown.style.left = `5px`;
        }
        if (dropdownRect.bottom > window.innerHeight - 5) {
            notesDropdown.style.top = `${targetRect.top - dropdownRect.height - 2}px`;
        }
    }

    function scheduleHideNotesDropdown() {
        clearTimeout(notesHideTimeout);
        notesHideTimeout = setTimeout(() => {
            if (notesDropdown && !notesDropdown.matches(':hover')) {
                hideNotesDropdown();
            }
        }, 200);
    }

    function hideNotesDropdown() {
        if (notesDropdown) {
            notesDropdown.style.display = 'none';
        }
    }

    function renderViewerState() {
        if (!viewerContainer || !placeholderElement ) return;

        if (isExpanded) {
            viewerContainer.classList.remove('collapsed');
            viewerContainer.classList.add('expanded');
            if (mainHeaderElement) {
                const mainHeaderRect = mainHeaderElement.getBoundingClientRect();
                // The placeholderElement for commit-viewer is *inside* mainHeaderElement
                const placeholderRect = placeholderElement.getBoundingClientRect(); 
                let leftRelativeToMainHeader = placeholderRect.left - mainHeaderRect.left;
                viewerContainer.style.left = `${leftRelativeToMainHeader}px`;
            } else {
                viewerContainer.style.left = '150px'; 
                console.warn("mainHeaderElement not found by commit-viewer, using fallback positioning for expanded viewer.");
            }
            renderCommitList();
        } else {
            viewerContainer.classList.remove('expanded');
            viewerContainer.classList.add('collapsed');
            viewerContainer.style.left = '';
            viewerContainer.style.right = '';
            viewerContainer.style.width = '';
            renderSingleCommitDisplay();
            hideNotesDropdown();
        }
        if (toggleButton) toggleButton.setAttribute('aria-expanded', isExpanded.toString());
    }

    function toggleExpansion(event) {
        if ((!isExpanded && event.currentTarget === viewerContainer) || (event.currentTarget === toggleButton)) {
            event.stopPropagation();
            isExpanded = !isExpanded;
            renderViewerState();
        }
    }

    function handleClickOutside(event) {
        if (viewerContainer && !viewerContainer.contains(event.target) && isExpanded) {
            if (notesDropdown && notesDropdown.contains(event.target)) {
                return;
            }
            isExpanded = false;
            renderViewerState();
        }
    }

    function setupDragScroll() {
        if (!scrollWrapper) return;
        scrollWrapper.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.pageX;
            scrollLeftStart = scrollWrapper.scrollLeft;
            scrollWrapper.style.cursor = 'grabbing';
            if(placeholderElement) placeholderElement.dataset.dragged = 'false';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !isExpanded) return;
            e.preventDefault();
            const x = e.pageX;
            const walk = x - startX;
            scrollWrapper.scrollLeft = scrollLeftStart - walk;
            if (placeholderElement && Math.abs(walk) > 5) {
                placeholderElement.dataset.dragged = 'true';
            }
        });
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            if (scrollWrapper) scrollWrapper.style.cursor = 'grab';
        });
    }

    // --- MAIN SCRIPT LOGIC for initCommitViewer ---
    try {
        const response = await fetch(viewerHtmlPath);
        if (!response.ok) {
            console.error(`Failed to load commit viewer HTML from ${viewerHtmlPath}: ${response.status} ${response.statusText}`);
            if(placeholderElement) placeholderElement.innerHTML = `<div style="color:red; font-size:0.8em; padding:5px;">Error: Could not load commit viewer HTML.</div>`;
            return;
        }
        
        const viewerHtmlString = await response.text();
        // console.log("Fetched HTML string for commit viewer component:", viewerHtmlString);
        
        if(placeholderElement) placeholderElement.innerHTML = viewerHtmlString;
        // console.log("Commit viewer component HTML set into its placeholder.");

        viewerContainer = document.getElementById('header-commit-viewer');
        // console.log("1. viewerContainer (commit viewer component root):", viewerContainer);

        if (viewerContainer) {
            singleCommitMessage = viewerContainer.querySelector('.hcv-commit-display .hcv-commit-message');
            singleCommitShaCollapsed = viewerContainer.querySelector('.hcv-commit-display .hcv-commit-details-collapsed .hcv-commit-sha-collapsed');
            singleCommitDate = viewerContainer.querySelector('.hcv-commit-display .hcv-commit-details-collapsed .hcv-commit-date');
            scrollWrapper = viewerContainer.querySelector('.hcv-scroll-wrapper');
            commitListUl = viewerContainer.querySelector('#hcv-commit-list');
            toggleButton = viewerContainer.querySelector('#hcv-toggle-button');
            notesDropdown = viewerContainer.querySelector('#hcv-notes-dropdown'); // Notes dropdown is part of the component's HTML
        } else {
            console.error("Commit viewer's main container ('#header-commit-viewer') not found after injection.");
            return; // Critical failure
        }
        
        if (notesDropdown) {
            notesDropdownContent = notesDropdown.querySelector('.hcv-notes-content');
            document.body.appendChild(notesDropdown); // Move to body for global positioning
        }


        if (!viewerContainer || !singleCommitMessage || !singleCommitShaCollapsed || !singleCommitDate || !scrollWrapper || !commitListUl || !toggleButton || !notesDropdown || !notesDropdownContent) {
            console.error("Some commit viewer internal elements not found. Check HTML structure and selectors.");
            // Log which one is missing for easier debugging
            if (!singleCommitMessage) console.error("- singleCommitMessage missing");
            if (!singleCommitShaCollapsed) console.error("- singleCommitShaCollapsed missing");
            if (!singleCommitDate) console.error("- singleCommitDate missing");
            // ... etc.
            return;
        }
        
        // Get the actual .main-header element, which is the parent of placeholderElement
        mainHeaderElement = placeholderElement.closest('.main-header'); 
        if (!mainHeaderElement) {
            console.warn("Could not find .main-header ancestor for commit viewer. Positioning may be affected.");
        }
        
        commitsData = await fetchCommits();
        if (commitsData.length > 0) {
            latestCommit = commitsData[0];
        }
        
        renderViewerState(); 

        viewerContainer.addEventListener('click', toggleExpansion);
        toggleButton.addEventListener('click', toggleExpansion); 
        document.addEventListener('click', handleClickOutside);
        setupDragScroll();
        console.log("Commit viewer initialized successfully.");

    } catch (error) {
        console.error("Error setting up header commit viewer:", error);
        if(placeholderElement) placeholderElement.innerHTML = `<div style="color:red; font-size:0.8em; padding:5px;">Commit Viewer Setup Error.</div>`;
    }
}

// Listen for the custom event dispatched by header-loader.js
document.addEventListener('mainHeaderLoaded', () => {
    console.log("'mainHeaderLoaded' event received. Initializing commit viewer.");
    initCommitViewer(); // Now initialize the commit viewer
});

// Fallback: If mainHeaderLoaded isn't dispatched (e.g. header-loader fails or is missing),
// try to initialize on DOMContentLoaded anyway, but it might fail if placeholder isn't ready.
// This is less ideal but provides a small chance of working if the event system has an issue.
// However, the primary mechanism is now the custom event.
// document.addEventListener('DOMContentLoaded', initCommitViewer); // This line is now effectively replaced by the custom event listener.
// It's better to rely solely on the event for clarity.