// Environment configuration
// Add Vite types for import.meta.env
declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}
 
// Helper function to ensure API base URL ends with /api
function normalizeApiBaseUrl(url: string | undefined): string {
  if (!url) {
    // Default fallback
    return 'http://localhost:5000/api';
  }
 
  // Remove trailing slash if present
  const normalized = url.trim().replace(/\/+$/, '');
 
  // Check if /api is already present
  if (normalized.endsWith('/api')) {
    return normalized;
  }
 
  // Append /api if not present
  return `${normalized}/api`;
}
 
export const config = {
  // Backend API URL - automatically appends /api if not present
  API_BASE_URL: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  // API Secret for authentication
  API_SECRET: import.meta.env.VITE_API_SECRET,
};
 
// Helper function to get selected show data from session storage
export const getSelectedShowData = () => {
  try {
    const storedData = sessionStorage.getItem("creator.selectedShowData");
    return storedData ? JSON.parse(storedData) : null;
  } catch (error) {
    console.error("Error parsing selected show data:", error);
    return null;
  }
};