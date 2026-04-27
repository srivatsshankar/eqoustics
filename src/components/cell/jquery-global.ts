import jQuery from 'jquery'

// Expose jQuery globally BEFORE MathQuill is imported.
// This must be a separate file so its side-effects run before the MathQuill import.
;(window as unknown as Record<string, unknown>).jQuery = jQuery
