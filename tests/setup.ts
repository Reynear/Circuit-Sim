import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"

// jsdom does not implement scrollIntoView.
Element.prototype.scrollIntoView ??= () => {}
