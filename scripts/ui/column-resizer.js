// scripts/ui/column-resizer.js
function initColumnResizer(
    leftColumnElement,      // The DOM element for the left column
    dividerElement,         // The DOM element for the divider/handle
    containerElement,       // The DOM element for the parent container of both columns
    storageKey,             // Key for localStorage to save the width
    isFlexBasis = true,     // True if left column uses flex-basis, false if it uses width
    onResizeCallback        // Optional callback function after resize (e.g., to trigger graph redraw)
) {
    if (!leftColumnElement || !dividerElement || !containerElement) {
        console.warn("Column resizer: Missing left column, divider, or container element.");
        return;
    }

    let isResizing = false;
    let startX, startWidth;

    // Apply stored width/flex-basis
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue) {
        if (isFlexBasis) {
            leftColumnElement.style.flexBasis = storedValue;
        } else {
            leftColumnElement.style.width = storedValue;
        }
    }

    dividerElement.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = leftColumnElement.offsetWidth; // Get current rendered width of the left column

        document.body.style.userSelect = 'none'; // Prevent text selection globally
        document.body.style.cursor = 'col-resize'; // Set global cursor during resize

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault(); // Prevent default mousedown behavior
    });

    function handleMouseMove(e) {
        if (!isResizing) return;

        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;

        const containerWidth = containerElement.offsetWidth;
        // Use getComputedStyle to respect CSS min/max-width
        const minWidth = parseFloat(window.getComputedStyle(leftColumnElement).minWidth) || 150;
        
        let maxWidth;
        const cssMaxWidth = window.getComputedStyle(leftColumnElement).maxWidth;
        if (cssMaxWidth.endsWith('%')) {
            maxWidth = (parseFloat(cssMaxWidth) / 100) * containerWidth;
        } else if (cssMaxWidth && cssMaxWidth !== 'none') {
            maxWidth = parseFloat(cssMaxWidth);
        } else {
            maxWidth = containerWidth * 0.8; // Default to 80% if not specified or 'none'
        }
        
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

        if (isFlexBasis) {
            leftColumnElement.style.flexBasis = newWidth + 'px';
        } else {
            leftColumnElement.style.width = newWidth + 'px';
        }
        
        e.preventDefault();
    }

    function handleMouseUp(e) {
        if (!isResizing) return;

        isResizing = false;
        // Restore default body styles
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Save the new width/flex-basis
        if (isFlexBasis) {
            localStorage.setItem(storageKey, leftColumnElement.style.flexBasis);
        } else {
            localStorage.setItem(storageKey, leftColumnElement.style.width);
        }
        
        // Trigger callback if provided
        if (typeof onResizeCallback === 'function') {
            onResizeCallback();
        }
        e.preventDefault();
    }
}