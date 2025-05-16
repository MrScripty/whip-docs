// scripts/ui/header-loader.js
document.addEventListener('DOMContentLoaded', async () => {
    const headerPlaceholderId = 'main-header-placeholder';
    const headerHtmlPath = '../web-pages/components/main-header.html'; 
    const headerPlaceholderElement = document.getElementById(headerPlaceholderId);

    if (!headerPlaceholderElement) {
        console.warn(`Header placeholder #${headerPlaceholderId} not found. Header will not be loaded.`);
        return;
    }

    try {
        const response = await fetch(headerHtmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load header HTML from ${headerHtmlPath}: ${response.status} ${response.statusText}`);
        }
        const headerHtml = await response.text();
        headerPlaceholderElement.innerHTML = headerHtml;
        console.log("Main header loaded successfully into placeholder."); // Keep for debugging

        // Set active class on nav links
        const currentPage = window.location.pathname.split('/').pop();
        
        const mainHeaderDiv = headerPlaceholderElement.querySelector('.main-header');
        if (mainHeaderDiv) {
            mainHeaderDiv.style.position = 'relative'; // Ensure .main-header is a positioning context
            const navLinks = mainHeaderDiv.querySelectorAll('nav a');
            navLinks.forEach(link => {
                const linkHref = link.getAttribute('href');
                if (linkHref && linkHref.endsWith(currentPage)) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        } else {
            console.warn("Could not find .main-header element within the loaded header HTML to set active links.");
        }

        // --- DISPATCH CUSTOM EVENT ---
        // This signals that the header (and its internal placeholders) are now in the DOM.
        document.dispatchEvent(new CustomEvent('mainHeaderLoaded', {
            detail: { headerElement: mainHeaderDiv } // Optionally pass the header element
        }));
        console.log("Dispatched 'mainHeaderLoaded' event.");

    } catch (error) { // <<<< ADDED OPENING BRACE
        console.error("Error loading main header:", error);
        headerPlaceholderElement.innerHTML = `<p style="color:red; text-align:center; padding: 10px; background-color: #4F5B66;">Error loading header.</p>`;
    } // <<<< This brace now correctly closes the catch block
});