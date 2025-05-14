// scripts/ui/commit-banner.js
document.addEventListener('DOMContentLoaded', async () => {
    const placeholderId = 'dynamic-commit-banner-placeholder';
    const bannerHtmlPath = 'components/commit-banner.html'; // Path relative to the HTML page
    const placeholderElement = document.getElementById(placeholderId);

    if (!placeholderElement) {
        return;
    }

    try {
        const response = await fetch(bannerHtmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load banner HTML from ${bannerHtmlPath}: ${response.statusText}`);
        }
        const bannerHtml = await response.text();
        placeholderElement.innerHTML = bannerHtml;

        const GITHUB_REPO_API_URL = "https://api.github.com/repos/MrScripty/Studio-Whip/commits";
        const NUM_COMMITS_TO_DISPLAY = 10;
        const commitListElement = document.getElementById('commit-list');

        if (!commitListElement) {
            console.error("Commit list element (#commit-list) not found within loaded banner HTML.");
            return;
        }

        const commitsResponse = await fetch(`${GITHUB_REPO_API_URL}?per_page=${NUM_COMMITS_TO_DISPLAY}`);
        if (!commitsResponse.ok) {
            if (commitsResponse.status === 403) {
                 console.warn("GitHub API rate limit exceeded. Commits cannot be loaded.");
                 commitListElement.innerHTML = `<li class="commit-item" style="justify-content: center; text-align: center; color: #ffcc00; background-color: transparent; border: none;">API rate limit.</li>`;
                 return;
            }
            throw new Error(`GitHub API error: ${commitsResponse.statusText} (Status: ${commitsResponse.status})`);
        }
        const commitsData = await commitsResponse.json();

        commitListElement.innerHTML = ''; 

        if (!commitsData || commitsData.length === 0) {
            commitListElement.innerHTML = `<li class="commit-item" style="justify-content: center; text-align: center; color: #c0c5ce;">No commits.</li>`;
            return;
        }

        commitsData.slice(0, NUM_COMMITS_TO_DISPLAY).forEach(commitEntry => {
            const commit = commitEntry.commit;
            const commitShaFull = commitEntry.sha; // Full SHA for tooltip
            const commitUrl = commitEntry.html_url;

            const listItem = document.createElement('li');
            listItem.className = 'commit-item';
            // Updated tooltip to include SHA and remove author
            listItem.title = `Commit: ${commit.message.split('\n')[0]}\nSHA: ${commitShaFull}\nDate: ${new Date(commit.author.date).toLocaleDateString()}`;
            
            listItem.addEventListener('click', (e) => {
                // Prevent click if it was part of a drag
                if (placeholderElement.dataset.dragged === 'true') {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                window.open(commitUrl, '_blank');
            });

            const messageDiv = document.createElement('div');
            messageDiv.className = 'commit-message';
            messageDiv.textContent = commit.message.split('\n')[0];

            // SHA is no longer displayed directly
            // const shaDiv = document.createElement('div');
            // shaDiv.className = 'commit-sha';
            // shaDiv.textContent = commitShaFull.substring(0, 7);

            // Author div removed
            // const authorDiv = document.createElement('div');
            // authorDiv.className = 'commit-author';
            // authorDiv.textContent = `by ${commit.author.name}`;

            const dateDiv = document.createElement('div');
            dateDiv.className = 'commit-date';
            dateDiv.textContent = new Date(commit.author.date).toLocaleDateString();
            
            listItem.appendChild(messageDiv);
            // listItem.appendChild(shaDiv); // SHA not appended directly
            // listItem.appendChild(authorDiv); // Author not appended
            listItem.appendChild(dateDiv);
            
            commitListElement.appendChild(listItem);
        });

        // Implement click-and-drag scrolling for the placeholderElement
        let isDragging = false;
        let startX;
        let scrollLeftStart;

        placeholderElement.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            isDragging = true;
            startX = e.pageX - placeholderElement.offsetLeft;
            scrollLeftStart = placeholderElement.scrollLeft;
            placeholderElement.style.cursor = 'grabbing';
            placeholderElement.dataset.dragged = 'false'; // Reset dragged flag
            e.preventDefault(); 
        });

        // Listen on document to allow dragging outside the banner once started
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - placeholderElement.offsetLeft;
            const walk = (x - startX);
            placeholderElement.scrollLeft = scrollLeftStart - walk;
            if (Math.abs(walk) > 5) { // Consider it a drag if moved more than 5px
                placeholderElement.dataset.dragged = 'true';
            }
        });

        const stopDragging = () => {
            if (!isDragging) return;
            isDragging = false;
            placeholderElement.style.cursor = 'grab';
            // The 'dragged' flag will be checked on click
        };

        document.addEventListener('mouseup', stopDragging);
        // Removed mouseleave from placeholderElement to allow drag continuation if mouse exits and re-enters while button is held.

    } catch (error) {
        console.error("Error setting up commit banner:", error);
        if (placeholderElement) {
            placeholderElement.innerHTML = `<div class="commit-banner" style="color: red; text-align: center; padding: 10px; align-items:center; justify-content:center;">Failed to load commit banner.</div>`;
        }
    }
});