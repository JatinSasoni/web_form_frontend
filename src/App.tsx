import BoatShowSelector from "./components/BoatShowSelector";
import axios from "axios";
import { config } from "./config/env";

// Define the ApiResponse type according to your API response structure
export interface ApiResponse {
  // Example fields, replace with actual response fields
  success: boolean;
  data: any;
  message?: string;
  // Add missing properties that the code expects
  users?: CalendarUser[];
  orgs?: string[];
  total_meetings?: number;
  // CRM response properties
  crm?: {
    success: boolean;
    records?: any[];
    meetings?: any[];
    duplicateLeadInfo?: any[];
    newLeadInfo?: any[];
    existingContactInfo?: any[];
    otherOrgResults?: any[];
  };
  creator?: any;
  timestamp?: string;
}

// Add the CalendarUser interface that the code expects
export interface CalendarUser {
  org: string;
  name: string;
  slots: {
    start_date: string;
    end_date: string;
  }[];
}

const API_BASE_URL = config.API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "X-API-Secret": config.API_SECRET,
  },
});

// Ensure the API secret is always attached (defense-in-depth)
api.interceptors.request.use((request) => {
  if (config.API_SECRET && request && request.headers) {
    request.headers["X-API-Secret"] = config.API_SECRET;
  }
  return request;
});

export const yachtAPI = {
  // Get all events
  getEvents: async (date: string): Promise<ApiResponse> => {
    try {
      const response = await api.get<ApiResponse>("/events/all", {
        params: {
          start: date,
          end: date,
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data; // Return the full response
    } catch (error) {
      console.error("Error fetching events:", error);
      throw error;
    }
  },

  // Get all events for all dates
  getAllEvents: async (startDate?: string, endDate?: string): Promise<ApiResponse> => {
    try {
      const response = await api.get<ApiResponse>("/events/all", {
        params: {
          start: startDate,
          end: endDate,
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching all events:", error);
      throw error;
    }
  },

  // Search for existing user by email (Leads first, then Contacts if not found)
  searchUserByEmail: async (email: string): Promise<any> => {
    try {
      const response = await api.get("/crm/search-email", {
        params: {
          email: email,
          module: "Leads",
          org: "both",
          search_contacts_if_not_in_leads: "true", // Also find email in Contacts
          _t: Date.now(),
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error searching for user by email:", error);
      throw error;
    }
  },

  // Get CRM users (for Tour Given By dropdown)
  getCRMUsers: async (): Promise<any> => {
    try {
      const response = await api.get("/crm/users", {
        params: {
          org: "main",
          type: "AllUsers",
          per_page: 200,
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching CRM users:", error);
      throw error;
    }
  },

  // Get sales representatives from Creator API
  getSalesRepresentatives: async (appName: string): Promise<any> => {
    try {
      const response = await api.get("/creator/sales-reps", {
        params: {
          appName: appName,
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching sales representatives:", error);
      throw error;
    }
  },

  // Create new event
  createEvent: async (eventData: any) => {
    try {
      const response = await api.post("/events", eventData);
      return response.data;
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  },

  // Get related Events from a Lead record
  getRelatedEvents: async (leadId: string, org: string = "main"): Promise<any> => {
    try {
      const response = await api.get(`/leads/${leadId}/events`, {
        params: {
          org: org,
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching related Events:", error);
      throw error;
    }
  },

  // Get related Events from a Lead record in both orgs
  getRelatedEventsBoth: async (leadId: string): Promise<any> => {
    try {
      const response = await api.get(`/leads/${leadId}/events/both`, {
        params: {
          _t: Date.now(), // Add timestamp to prevent caching
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching related Events from both orgs:", error);
      throw error;
    }
  },

  // Enrich a lead via OpenAI web search
  enrichLead: async (data: { firstName: string; lastName: string; email: string; mobile?: string; country?: string }): Promise<any> => {
    try {
      const response = await api.post("/enrich", data);
      return response.data;
    } catch (error: any) {
      console.error("Error enriching lead:", error.response?.data || error.message);
      throw error;
    }
  },

  // Submit form data to both Zoho CRM and Zoho Creator
  submitForm: async (formData: any, appName: string) => {
    try {
      
      // 🎯 NEW: First submit to CRM to get duplicate lead info and new lead info
      let crmResult = null;
      let duplicateLeadInfo = [];
      let newLeadInfo = [];
      let existingContactInfo = [];
      
      try {
        const crmResponse = await api.post("/leads", formData);
        crmResult = crmResponse.data;
        // keep minimal success signal in UI via returned result only
        
        // Extract duplicate lead info if available
        if (crmResult.duplicateLeadInfo) {
          duplicateLeadInfo = crmResult.duplicateLeadInfo;
           // keep in result only
        }
        
        // Extract new lead info if available
        if (crmResult.newLeadInfo) {
          newLeadInfo = crmResult.newLeadInfo;
           // keep in result only
        }

        // Extract existing contact info if available (contact found in CRM,
        // so no lead was created — meeting is linked to the contact)
        if (crmResult.existingContactInfo) {
          existingContactInfo = crmResult.existingContactInfo;
           // keep in result only
        }
      } catch (error: any) {
        console.error("❌ Zoho CRM submission failed:", error.response?.data || error.message);
        // Even if CRM fails, try to get duplicate info from error response
        if (error.response?.data?.duplicateLeadInfo) {
          duplicateLeadInfo = error.response.data.duplicateLeadInfo;
           // keep in result only
        }
        // Also try to get new lead info from error response
        if (error.response?.data?.newLeadInfo) {
          newLeadInfo = error.response.data.newLeadInfo;
           // keep in result only
        }
        // Also try to get existing contact info from error response
        if (error.response?.data?.existingContactInfo) {
          existingContactInfo = error.response.data.existingContactInfo;
           // keep in result only
        }
        // Create a crmResult object with the lead info even if submission failed
        if (duplicateLeadInfo.length > 0 || newLeadInfo.length > 0 || existingContactInfo.length > 0 || error.response?.data?.meetings) {
          crmResult = {
            success: false,
            duplicateLeadInfo: duplicateLeadInfo,
            newLeadInfo: newLeadInfo,
            existingContactInfo: existingContactInfo,
            meetings: error.response?.data?.meetings || []
          };
           // keep in result only
        }
      }
      
      // 🎯 NEW: Then submit to Creator with duplicate lead info and new lead info
      let creatorResult = null;
      try {
        // Add duplicate lead info and new lead info to form data for Creator
        const creatorFormData = {
          ...formData,
          duplicateLeadInfo: duplicateLeadInfo,
          newLeadInfo: newLeadInfo,
          existingContactInfo: existingContactInfo
        };
        
        const creatorResponse = await api.post("/creator/leads", creatorFormData, {
          params: {
            appName: appName
          }
        });
        creatorResult = creatorResponse.data;
        // keep minimal success signal in UI via returned result only
      } catch (error: any) {
        console.error("❌ Zoho Creator API error:", error.response?.data || error.message);
      }

      // Process responses (variables already declared above)
      // return combined result only; no console noise

      // Return combined result
      return {
        success: true,
        message: "Form submitted successfully to both systems",
        crm: crmResult,
        creator: creatorResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("Error submitting form to Zoho systems:", error);
      throw error;
    }
  },
};

function App() {
  return (
    <div className="App">
      <BoatShowSelector />
    </div>
  );
}

export default App;
