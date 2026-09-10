import React, { useState, useEffect, useRef } from "react";
import "./YachtCharterForm.css";
import { yachtAPI } from "../App";
import { getSelectedShowData } from "../config/env";

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  city: string;
  state: string;
  country: string;
  postal: string;
  currentOwner: boolean | null;
  interestedCharter: boolean | null;
  isBroker: boolean;
  boatType: string;
  modelInterested: string;
  budgetAllocation: string;
  purchaseTimeline: string;
  commercial: boolean;
  marketing: boolean;
  notes: string;
  hereFor: string; // New field
  tourGivenBy: string;
  fromDate: string;
  fromTime: string;
  toTime: string;
}

/**
 * Email validation.
 *
 * The browser's own type="email" check only requires an "@", so it accepts
 * "guest@gmail" with no domain ending at all. These rules sit on top of it.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

// Domain endings that are only ever a typo — none of these are real TLDs.
const INVALID_TLDS = [
  "con",
  "cno",
  "cmo",
  "ocm",
  "cpm",
  "vom",
  "xom",
  "comm",
  "coom",
  "cim",
  "clm",
  "comn",
  "copm",
  "cop",
  "bet",
  "nte",
  "ner",
  "ogr",
  "rog",
];

export function isValidEmail(raw: string): boolean {
  const email = (raw || "").trim();
  if (!email) return true; // empty is handled by the required-field check
  if (!EMAIL_SHAPE.test(email)) return false;
  const tld = email.slice(email.lastIndexOf(".") + 1).toLowerCase();
  return !INVALID_TLDS.includes(tld);
}

interface YachtCharterFormProps {
  // Parent bumps a key to remount this component (resets all state) instead of a full page reload
  onRefresh?: () => void;
}

const YachtCharterForm: React.FC<YachtCharterFormProps> = ({ onRefresh }) => {
  // Selected show heading from session (Event_Heading)
  const [eventHeading, setEventHeading] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [eventStartDate, setEventStartDate] = useState<string>("");
  const [eventEndDate, setEventEndDate] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedTimezone, setSelectedTimezone] = useState<string>("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("creator.selectedShowData");
      if (raw) {
        const obj = JSON.parse(raw);
        setEventHeading(obj?.Event_Heading || null);

        // Extract available models from the selected show data
        const models = obj?.Model_Interested_In || [];
        setAvailableModels(Array.isArray(models) ? models : []);

        // Extract ports from the selected show data
        const rawPorts = obj?.Ports || obj?._raw?.Ports || [];
        const parsedPorts = Array.isArray(rawPorts)
          ? rawPorts
              .map((p: any) => ({
                id: p.ID || p.id || "",
                name: p.display_value || p.name || "",
              }))
              .filter((p: any) => p.name)
          : [];
        setPortOptions(parsedPorts);

        // Default the Stand Location to the first port of this show so a
        // submission always carries one. A port kept from a previous form
        // fill wins, but only if it belongs to the show now selected.
        if (parsedPorts.length > 0) {
          let storedPort = "";
          try {
            storedPort = sessionStorage.getItem("sunreef-selected-port") || "";
          } catch {}
          const defaultPort = parsedPorts.some((p) => p.name === storedPort)
            ? storedPort
            : parsedPorts[0].name;
          setSelectedPort(defaultPort);
          try {
            sessionStorage.setItem("sunreef-selected-port", defaultPort);
          } catch {}
        }

        // Extract event dates from the selected show data
        const startDate = obj?.Event_Start_Date;
        const endDate = obj?.Event_End_Date;

        // Validate that event dates are provided
        if (!startDate || !endDate) {
          throw new Error(
            "Event_Start_Date and Event_End_Date are required in selected show data"
          );
        }

        setEventStartDate(startDate);
        setEventEndDate(endDate);

        // Extract country from the selected show data
        const countryName = obj?.Country?.display_value;

        // Validate that country is provided
        if (!countryName) {
          throw new Error("Country is required in selected show data");
        }

        setSelectedCountry(countryName);

        // Map country to timezone
        const timezone = countryToTimezone[countryName];
        if (!timezone) {
          throw new Error(
            `No timezone mapping found for country: ${countryName}`
          );
        }

        setSelectedTimezone(timezone);
      }
    } catch (error) {
      console.error(
        "Error parsing selected show data from session storage:",
        error
      );
    }
  }, []);

  // Helper: postal code required only when event config Set_Postal_Code_Mandatory (checkbox) is true
  const isPostalCodeRequired = (): boolean => {
    const showData = getSelectedShowData();
    if (!showData) return false;
    const value = showData.Set_Postal_Code_Mandatory;
    // Checkbox can come as boolean, "true"/"false", 1/0, or empty string from Creator
    return value === true || value === "true" || value === 1;
  };

  // Helper function to add 30 minutes to a time string
  const add30Minutes = (timeString: string): string => {
    if (!timeString) return "";

    const [hours, minutes] = timeString.split(":").map(Number);
    let newMinutes = minutes + 30;
    let newHours = hours;

    // Handle hour overflow
    if (newMinutes >= 60) {
      newMinutes = newMinutes - 60;
      newHours = newHours + 1;
    }

    // Handle day overflow (if time goes beyond 24:00, cap at 24:00)
    if (newHours > 24) {
      return "24:00";
    }

    // Format the result
    const formattedHours = newHours.toString().padStart(2, "0");
    const formattedMinutes = newMinutes.toString().padStart(2, "0");

    return `${formattedHours}:${formattedMinutes}`;
  };

  // Helper function to convert date format from "10-Oct-2025" to "2025-10-10"
  const convertDateFormat = (dateStr: string): string => {
    if (!dateStr) return "";

    const months: { [key: string]: string } = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };

    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = months[parts[1]];
      const year = parts[2];

      if (!month) {
        console.error("Invalid month in date string:", dateStr);
        return "";
      }

      const convertedDate = `${year}-${month}-${day}`;
      const date = new Date(convertedDate);

      if (isNaN(date.getTime())) {
        console.error("Invalid date after conversion:", convertedDate);
        return "";
      }

      return convertedDate;
    }
    return "";
  };

  // Helper function to format date to dd-mmm-yyyy format for display
  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "";

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";

      const day = String(date.getDate()).padStart(2, "0");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    } catch (error) {
      console.error("Error formatting date for display:", error);
      return "";
    }
  };

  // Helper function to generate dates between start and end date
  const generateDateRange = (
    startDate: string,
    endDate: string
  ): Array<{ date: string; day: string }> => {
    if (!startDate || !endDate) return [];

    const startConverted = convertDateFormat(startDate);
    const endConverted = convertDateFormat(endDate);

    if (!startConverted || !endConverted) {
      console.error("Failed to convert dates:", {
        startDate,
        endDate,
        startConverted,
        endConverted,
      });
      return [];
    }

    const start = new Date(startConverted);
    const end = new Date(endConverted);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error("Invalid dates after conversion:", { start, end });
      return [];
    }

    const dates = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const day = d.getDate().toString();
      dates.push({ date: dateStr, day });
    }

    return dates;
  };

  // Helper function to get current time in selected country timezone and find closest available time slot
  const getCurrentCountryTime = () => {
    if (!selectedTimezone) {
      throw new Error("Selected timezone is required");
    }

    const now = new Date();
    const countryTime = now.toLocaleString("en-US", {
      timeZone: selectedTimezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    // Available time slots (00:00 to 24:00 in 30-minute intervals - full 24h)
    const timeSlots = [
      "00:00",
      "00:30",
      "01:00",
      "01:30",
      "02:00",
      "02:30",
      "03:00",
      "03:30",
      "04:00",
      "04:30",
      "05:00",
      "05:30",
      "06:00",
      "06:30",
      "07:00",
      "07:30",
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
      "17:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
      "22:30",
      "23:00",
      "23:30",
      "24:00",
    ];

    // Parse current time
    const [currentHour, currentMinute] = countryTime.split(":").map(Number);
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // Find the closest time slot (round to nearest 30-minute interval)
    let closestSlot = timeSlots[0];
    let minDifference = Infinity;

    for (const slot of timeSlots) {
      const [slotHour, slotMinute] = slot.split(":").map(Number);
      const slotTimeInMinutes = slotHour * 60 + slotMinute;
      const difference = Math.abs(currentTimeInMinutes - slotTimeInMinutes);

      if (difference < minDifference) {
        minDifference = difference;
        closestSlot = slot;
      }
    }

    return closestSlot;
  };

  // Dynamic festival dates based on selected show data
  const today = new Date();
  const todayString = today.toISOString().split("T")[0];

  // Generate festival dates from event start and end dates
  const festivalDates = generateDateRange(eventStartDate, eventEndDate);

  // Check if today's date matches any festival date for auto-selection
  const isTodayFestivalDate = festivalDates.some((d) => d.date === todayString);

  // Default date logic: Use event start date, then if today is a festival date, use today
  const getDefaultDate = () => {
    if (isTodayFestivalDate) {
      return todayString; // Use today if it's a festival date
    }
    if (eventStartDate) {
      return convertDateFormat(eventStartDate); // Use dynamic event start date
    }
    return todayString; // Fallback to today if no event start date
  };

  // Form state
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    city: "",
    state: "",
    country: "",
    postal: "",
    currentOwner: null,
    interestedCharter: null,
    isBroker: false,
    boatType: "",
    modelInterested: "",
    budgetAllocation: "",
    purchaseTimeline: "",
    commercial: true,
    marketing: true,
    notes: "",
    hereFor: "", // Initialize new field
    tourGivenBy: "",
    fromDate: getDefaultDate(), // Default to event start date, then work based on today's date
    fromTime: "08:00", // Default time
    toTime: "08:30", // Auto-set to 30 minutes after fromTime
  });

  // UI state
  const [currentDateTime, setCurrentDateTime] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] =
    useState<Country | null>(null);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchTerm, setCountrySearchTerm] = useState("");
  const [currentSelectedDate, setCurrentSelectedDate] = useState(() => {
    const defaultDate = getDefaultDate();
    const date = new Date(defaultDate);
    return isNaN(date.getTime()) ? new Date() : date;
  });
  const [calendarEvents, setCalendarEvents] = useState<
    Map<string, CalendarEvent[]>
  >(new Map());
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [salesRepsData, setSalesRepsData] = useState<any[]>([]);
  const [tourGivenByOptions, setTourGivenByOptions] = useState<string[]>([]);
  const [portOptions, setPortOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedPort, setSelectedPort] = useState<string>(() => {
    try {
      return sessionStorage.getItem("sunreef-selected-port") || "";
    } catch {
      return "";
    }
  });

  // Calendar visibility state
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0); // 0 = hidden, 100 = fully visible

  // Summary slide state
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Calendar slider state
  const [isDragging, setIsDragging] = useState(false);

  // Touch event state to prevent double triggering
  const [touchHandled, setTouchHandled] = useState(false);

  // Email validation state
  const [emailSearchResult, setEmailSearchResult] = useState<{
    exists: boolean;
    data: any[];
    message: string;
    events?: any[];
    eventsError?: string;
  } | null>(null);
  const [isSearchingEmail, setIsSearchingEmail] = useState(false);

  // Lead enrichment state
  const [enrichedData, setEnrichedData] = useState<{
    wealthCategory: string | null;
    aiLeadScore: number | null;
    profileSummary: string;
  } | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);

  // Pending CRM records held until enrichment finishes (not shown yet)
  const pendingCrmRecordsRef = useRef<any[]>([]);
  const pendingCrmEventsRef = useRef<any[]>([]);
  const pendingCrmEventsErrorRef = useRef<string | undefined>(undefined);

  // Date validation state
  const [dateValidationError, setDateValidationError] = useState<string>("");

  // Country to timezone mapping
  const countryToTimezone: { [key: string]: string } = {
    Afghanistan: "Asia/Kabul",
    Albania: "Europe/Tirane",
    Algeria: "Africa/Algiers",
    "American Samoa": "Pacific/Pago_Pago",
    Andorra: "Europe/Andorra",
    Angola: "Africa/Luanda",
    Anguilla: "America/Anguilla",
    Antarctica: "Antarctica/McMurdo",
    "Antigua and Barbuda": "America/Antigua",
    Argentina: "America/Argentina/Buenos_Aires",
    Armenia: "Asia/Yerevan",
    Aruba: "America/Aruba",
    Australia: "Australia/Sydney",
    Austria: "Europe/Vienna",
    Azerbaijan: "Asia/Baku",
    Bahamas: "America/Nassau",
    Bahrain: "Asia/Bahrain",
    Bangladesh: "Asia/Dhaka",
    Barbados: "America/Barbados",
    Belarus: "Europe/Minsk",
    Belgium: "Europe/Brussels",
    Belize: "America/Belize",
    Benin: "Africa/Porto-Novo",
    Bermuda: "Atlantic/Bermuda",
    Bhutan: "Asia/Thimphu",
    Bolivia: "America/La_Paz",
    "Bosnia and Herzegovina": "Europe/Sarajevo",
    Botswana: "Africa/Gaborone",
    Brazil: "America/Sao_Paulo",
    "British Indian Ocean Territory": "Indian/Chagos",
    Brunei: "Asia/Brunei",
    Bulgaria: "Europe/Sofia",
    "Burkina Faso": "Africa/Ouagadougou",
    Burundi: "Africa/Bujumbura",
    Cambodia: "Asia/Phnom_Penh",
    Cameroon: "Africa/Douala",
    Canada: "America/Toronto",
    "Cape Verde": "Atlantic/Cape_Verde",
    "Cayman Islands": "America/Cayman",
    "Central African Republic": "Africa/Bangui",
    Chad: "Africa/Ndjamena",
    Chile: "America/Santiago",
    China: "Asia/Shanghai",
    "Christmas Island": "Indian/Christmas",
    "Cocos Islands": "Indian/Cocos",
    Colombia: "America/Bogota",
    Comoros: "Indian/Comoro",
    Congo: "Africa/Brazzaville",
    "Cook Islands": "Pacific/Rarotonga",
    "Costa Rica": "America/Costa_Rica",
    Croatia: "Europe/Zagreb",
    Cuba: "America/Havana",
    Cyprus: "Asia/Nicosia",
    "Czech Republic": "Europe/Prague",
    Denmark: "Europe/Copenhagen",
    Djibouti: "Africa/Djibouti",
    Dominica: "America/Dominica",
    "Dominican Republic": "America/Santo_Domingo",
    Ecuador: "America/Guayaquil",
    Egypt: "Africa/Cairo",
    "El Salvador": "America/El_Salvador",
    "Equatorial Guinea": "Africa/Malabo",
    Eritrea: "Africa/Asmara",
    Estonia: "Europe/Tallinn",
    Ethiopia: "Africa/Addis_Ababa",
    "Falkland Islands": "Atlantic/Stanley",
    "Faroe Islands": "Atlantic/Faroe",
    Fiji: "Pacific/Fiji",
    Finland: "Europe/Helsinki",
    France: "Europe/Paris",
    "French Guiana": "America/Cayenne",
    "French Polynesia": "Pacific/Tahiti",
    Gabon: "Africa/Libreville",
    Gambia: "Africa/Banjul",
    Georgia: "Asia/Tbilisi",
    Germany: "Europe/Berlin",
    Ghana: "Africa/Accra",
    Gibraltar: "Europe/Gibraltar",
    Greece: "Europe/Athens",
    Greenland: "America/Godthab",
    Grenada: "America/Grenada",
    Guadeloupe: "America/Guadeloupe",
    Guam: "Pacific/Guam",
    Guatemala: "America/Guatemala",
    Guernsey: "Europe/Guernsey",
    Guinea: "Africa/Conakry",
    "Guinea-Bissau": "Africa/Bissau",
    Guyana: "America/Guyana",
    Haiti: "America/Port-au-Prince",
    Honduras: "America/Tegucigalpa",
    "Hong Kong": "Asia/Hong_Kong",
    Hungary: "Europe/Budapest",
    Iceland: "Atlantic/Reykjavik",
    India: "Asia/Kolkata",
    Indonesia: "Asia/Jakarta",
    Iran: "Asia/Tehran",
    Iraq: "Asia/Baghdad",
    Ireland: "Europe/Dublin",
    "Isle of Man": "Europe/Isle_of_Man",
    Israel: "Asia/Jerusalem",
    Italy: "Europe/Rome",
    Jamaica: "America/Jamaica",
    Japan: "Asia/Tokyo",
    Jersey: "Europe/Jersey",
    Jordan: "Asia/Amman",
    Kazakhstan: "Asia/Almaty",
    Kenya: "Africa/Nairobi",
    Kiribati: "Pacific/Tarawa",
    Kuwait: "Asia/Kuwait",
    Kyrgyzstan: "Asia/Bishkek",
    Laos: "Asia/Vientiane",
    Latvia: "Europe/Riga",
    Lebanon: "Asia/Beirut",
    Lesotho: "Africa/Maseru",
    Liberia: "Africa/Monrovia",
    Libya: "Africa/Tripoli",
    Liechtenstein: "Europe/Vaduz",
    Lithuania: "Europe/Vilnius",
    Luxembourg: "Europe/Luxembourg",
    Macau: "Asia/Macau",
    Macedonia: "Europe/Skopje",
    Madagascar: "Indian/Antananarivo",
    Malawi: "Africa/Blantyre",
    Malaysia: "Asia/Kuala_Lumpur",
    Maldives: "Indian/Maldives",
    Mali: "Africa/Bamako",
    Malta: "Europe/Malta",
    "Marshall Islands": "Pacific/Majuro",
    Martinique: "America/Martinique",
    Mauritania: "Africa/Nouakchott",
    Mauritius: "Indian/Mauritius",
    Mayotte: "Indian/Mayotte",
    Mexico: "America/Mexico_City",
    Micronesia: "Pacific/Chuuk",
    Moldova: "Europe/Chisinau",
    Monaco: "Europe/Paris",
    Mongolia: "Asia/Ulaanbaatar",
    Montenegro: "Europe/Podgorica",
    Montserrat: "America/Montserrat",
    Morocco: "Africa/Casablanca",
    Mozambique: "Africa/Maputo",
    Myanmar: "Asia/Yangon",
    Namibia: "Africa/Windhoek",
    Nauru: "Pacific/Nauru",
    Nepal: "Asia/Kathmandu",
    Netherlands: "Europe/Amsterdam",
    "New Caledonia": "Pacific/Noumea",
    "New Zealand": "Pacific/Auckland",
    Nicaragua: "America/Managua",
    Niger: "Africa/Niamey",
    Nigeria: "Africa/Lagos",
    Niue: "Pacific/Niue",
    "Norfolk Island": "Pacific/Norfolk",
    "North Korea": "Asia/Pyongyang",
    "Northern Mariana Islands": "Pacific/Saipan",
    Norway: "Europe/Oslo",
    Oman: "Asia/Muscat",
    Pakistan: "Asia/Karachi",
    Palau: "Pacific/Palau",
    Palestine: "Asia/Gaza",
    Panama: "America/Panama",
    "Papua New Guinea": "Pacific/Port_Moresby",
    Paraguay: "America/Asuncion",
    Peru: "America/Lima",
    Philippines: "Asia/Manila",
    Pitcairn: "Pacific/Pitcairn",
    Poland: "Europe/Warsaw",
    Portugal: "Europe/Lisbon",
    "Puerto Rico": "America/Puerto_Rico",
    Qatar: "Asia/Qatar",
    Reunion: "Indian/Reunion",
    Romania: "Europe/Bucharest",
    Russia: "Europe/Moscow",
    Rwanda: "Africa/Kigali",
    "Saint Helena": "Atlantic/St_Helena",
    "Saint Kitts and Nevis": "America/St_Kitts",
    "Saint Lucia": "America/St_Lucia",
    "Saint Pierre and Miquelon": "America/Miquelon",
    "Saint Vincent and the Grenadines": "America/St_Vincent",
    Samoa: "Pacific/Apia",
    "San Marino": "Europe/San_Marino",
    "Sao Tome and Principe": "Africa/Sao_Tome",
    "Saudi Arabia": "Asia/Riyadh",
    Senegal: "Africa/Dakar",
    Serbia: "Europe/Belgrade",
    Seychelles: "Indian/Mahe",
    "Sierra Leone": "Africa/Freetown",
    Singapore: "Asia/Singapore",
    Slovakia: "Europe/Bratislava",
    Slovenia: "Europe/Ljubljana",
    "Solomon Islands": "Pacific/Guadalcanal",
    Somalia: "Africa/Mogadishu",
    "South Africa": "Africa/Johannesburg",
    "South Korea": "Asia/Seoul",
    "South Sudan": "Africa/Juba",
    Spain: "Europe/Madrid",
    "Sri Lanka": "Asia/Colombo",
    Sudan: "Africa/Khartoum",
    Suriname: "America/Paramaribo",
    Swaziland: "Africa/Mbabane",
    Sweden: "Europe/Stockholm",
    Switzerland: "Europe/Zurich",
    Syria: "Asia/Damascus",
    Taiwan: "Asia/Taipei",
    Tajikistan: "Asia/Dushanbe",
    Tanzania: "Africa/Dar_es_Salaam",
    Thailand: "Asia/Bangkok",
    "Timor-Leste": "Asia/Dili",
    Togo: "Africa/Lome",
    Tokelau: "Pacific/Fakaofo",
    Tonga: "Pacific/Tongatapu",
    "Trinidad and Tobago": "America/Port_of_Spain",
    Tunisia: "Africa/Tunis",
    Turkey: "Europe/Istanbul",
    Turkmenistan: "Asia/Ashgabat",
    "Turks and Caicos Islands": "America/Grand_Turk",
    Tuvalu: "Pacific/Funafuti",
    Uganda: "Africa/Kampala",
    Ukraine: "Europe/Kiev",
    "United Arab Emirates": "Asia/Dubai",
    "United Kingdom": "Europe/London",
    "United States": "America/New_York",
    Uruguay: "America/Montevideo",
    Uzbekistan: "Asia/Tashkent",
    Vanuatu: "Pacific/Efate",
    "Vatican City": "Europe/Vatican",
    Venezuela: "America/Caracas",
    Vietnam: "Asia/Ho_Chi_Minh",
    "Virgin Islands": "America/St_Thomas",
    "Wallis and Futuna": "Pacific/Wallis",
    "Western Sahara": "Africa/El_Aaiun",
    Yemen: "Asia/Aden",
    Zambia: "Africa/Lusaka",
    Zimbabwe: "Africa/Harare",
  };

  // Complete countries data - All 249 countries sorted alphabetically by country name
  const countries: Country[] = [
    { code: "AD", name: "Andorra", dialCode: "+376", flag: "🇦🇩" },
    { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
    { code: "AF", name: "Afghanistan", dialCode: "+93", flag: "🇦🇫" },
    { code: "AG", name: "Antigua and Barbuda", dialCode: "+1", flag: "🇦🇬" },
    { code: "AI", name: "Anguilla", dialCode: "+1", flag: "🇦🇮" },
    { code: "AL", name: "Albania", dialCode: "+355", flag: "🇦🇱" },
    { code: "AM", name: "Armenia", dialCode: "+374", flag: "🇦🇲" },
    { code: "AO", name: "Angola", dialCode: "+244", flag: "🇦🇴" },
    { code: "AQ", name: "Antarctica", dialCode: "+672", flag: "🇦🇶" },
    { code: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" },
    { code: "AS", name: "American Samoa", dialCode: "+1", flag: "🇦🇸" },
    { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
    { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
    { code: "AW", name: "Aruba", dialCode: "+297", flag: "🇦🇼" },
    { code: "AX", name: "Åland Islands", dialCode: "+358", flag: "🇦🇽" },
    { code: "AZ", name: "Azerbaijan", dialCode: "+994", flag: "🇦🇿" },
    {
      code: "BA",
      name: "Bosnia and Herzegovina",
      dialCode: "+387",
      flag: "🇧🇦",
    },
    { code: "BB", name: "Barbados", dialCode: "+1", flag: "🇧🇧" },
    { code: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
    { code: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪" },
    { code: "BF", name: "Burkina Faso", dialCode: "+226", flag: "🇧🇫" },
    { code: "BG", name: "Bulgaria", dialCode: "+359", flag: "🇧🇬" },
    { code: "BH", name: "Bahrain", dialCode: "+973", flag: "🇧🇭" },
    { code: "BI", name: "Burundi", dialCode: "+257", flag: "🇧🇮" },
    { code: "BJ", name: "Benin", dialCode: "+229", flag: "🇧🇯" },
    { code: "BL", name: "Saint Barthélemy", dialCode: "+590", flag: "🇧🇱" },
    { code: "BM", name: "Bermuda", dialCode: "+1", flag: "🇧🇲" },
    { code: "BN", name: "Brunei", dialCode: "+673", flag: "🇧🇳" },
    { code: "BO", name: "Bolivia", dialCode: "+591", flag: "🇧🇴" },
    { code: "BQ", name: "Caribbean Netherlands", dialCode: "+599", flag: "🇧🇶" },
    { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
    { code: "BS", name: "Bahamas", dialCode: "+1", flag: "🇧🇸" },
    { code: "BT", name: "Bhutan", dialCode: "+975", flag: "🇧🇹" },
    { code: "BV", name: "Bouvet Island", dialCode: "+47", flag: "🇧🇻" },
    { code: "BW", name: "Botswana", dialCode: "+267", flag: "🇧🇼" },
    { code: "BY", name: "Belarus", dialCode: "+375", flag: "🇧🇾" },
    { code: "BZ", name: "Belize", dialCode: "+501", flag: "🇧🇿" },
    { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
    { code: "CC", name: "Cocos Islands", dialCode: "+61", flag: "🇨🇨" },
    {
      code: "CD",
      name: "Democratic Republic of the Congo",
      dialCode: "+243",
      flag: "🇨🇩",
    },
    {
      code: "CF",
      name: "Central African Republic",
      dialCode: "+236",
      flag: "🇨🇫",
    },
    { code: "CG", name: "Republic of the Congo", dialCode: "+242", flag: "🇨🇬" },
    { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" },
    { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", flag: "🇨🇮" },
    { code: "CK", name: "Cook Islands", dialCode: "+682", flag: "🇨🇰" },
    { code: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱" },
    { code: "CM", name: "Cameroon", dialCode: "+237", flag: "🇨🇲" },
    { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
    { code: "CO", name: "Colombia", dialCode: "+57", flag: "🇨🇴" },
    { code: "CR", name: "Costa Rica", dialCode: "+506", flag: "🇨🇷" },
    { code: "CU", name: "Cuba", dialCode: "+53", flag: "🇨🇺" },
    { code: "CV", name: "Cape Verde", dialCode: "+238", flag: "🇨🇻" },
    { code: "CW", name: "Curaçao", dialCode: "+599", flag: "🇨🇼" },
    { code: "CX", name: "Christmas Island", dialCode: "+61", flag: "🇨🇽" },
    { code: "CY", name: "Cyprus", dialCode: "+357", flag: "🇨🇾" },
    { code: "CZ", name: "Czech Republic", dialCode: "+420", flag: "🇨🇿" },
    { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
    { code: "DJ", name: "Djibouti", dialCode: "+253", flag: "🇩🇯" },
    { code: "DK", name: "Denmark", dialCode: "+45", flag: "🇩🇰" },
    { code: "DM", name: "Dominica", dialCode: "+1", flag: "🇩🇲" },
    { code: "DO", name: "Dominican Republic", dialCode: "+1", flag: "🇩🇴" },
    { code: "DZ", name: "Algeria", dialCode: "+213", flag: "🇩🇿" },
    { code: "EC", name: "Ecuador", dialCode: "+593", flag: "🇪🇨" },
    { code: "EE", name: "Estonia", dialCode: "+372", flag: "🇪🇪" },
    { code: "EG", name: "Egypt", dialCode: "+20", flag: "🇪🇬" },
    { code: "EH", name: "Western Sahara", dialCode: "+212", flag: "🇪🇭" },
    { code: "ER", name: "Eritrea", dialCode: "+291", flag: "🇪🇷" },
    { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
    { code: "ET", name: "Ethiopia", dialCode: "+251", flag: "🇪🇹" },
    { code: "FI", name: "Finland", dialCode: "+358", flag: "🇫🇮" },
    { code: "FJ", name: "Fiji", dialCode: "+679", flag: "🇫🇯" },
    { code: "FK", name: "Falkland Islands", dialCode: "+500", flag: "🇫🇰" },
    { code: "FM", name: "Micronesia", dialCode: "+691", flag: "🇫🇲" },
    { code: "FO", name: "Faroe Islands", dialCode: "+298", flag: "🇫🇴" },
    { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
    { code: "GA", name: "Gabon", dialCode: "+241", flag: "🇬🇦" },
    { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
    { code: "GD", name: "Grenada", dialCode: "+1", flag: "🇬🇩" },
    { code: "GE", name: "Georgia", dialCode: "+995", flag: "🇬🇪" },
    { code: "GF", name: "French Guiana", dialCode: "+594", flag: "🇬🇫" },
    { code: "GG", name: "Guernsey", dialCode: "+44", flag: "🇬🇬" },
    { code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },
    { code: "GI", name: "Gibraltar", dialCode: "+350", flag: "🇬🇮" },
    { code: "GL", name: "Greenland", dialCode: "+299", flag: "🇬🇱" },
    { code: "GM", name: "Gambia", dialCode: "+220", flag: "🇬🇲" },
    { code: "GN", name: "Guinea", dialCode: "+224", flag: "🇬🇳" },
    { code: "GP", name: "Guadeloupe", dialCode: "+590", flag: "🇬🇵" },
    { code: "GQ", name: "Equatorial Guinea", dialCode: "+240", flag: "🇬🇶" },
    { code: "GR", name: "Greece", dialCode: "+30", flag: "🇬🇷" },
    {
      code: "GS",
      name: "South Georgia and the South Sandwich Islands",
      dialCode: "+500",
      flag: "🇬🇸",
    },
    { code: "GT", name: "Guatemala", dialCode: "+502", flag: "🇬🇹" },
    { code: "GU", name: "Guam", dialCode: "+1", flag: "🇬🇺" },
    { code: "GW", name: "Guinea-Bissau", dialCode: "+245", flag: "🇬🇼" },
    { code: "GY", name: "Guyana", dialCode: "+592", flag: "🇬🇾" },
    { code: "HK", name: "Hong Kong", dialCode: "+852", flag: "🇭🇰" },
    {
      code: "HM",
      name: "Heard Island and McDonald Islands",
      dialCode: "+672",
      flag: "🇭🇲",
    },
    { code: "HN", name: "Honduras", dialCode: "+504", flag: "🇭🇳" },
    { code: "HR", name: "Croatia", dialCode: "+385", flag: "🇭🇷" },
    { code: "HT", name: "Haiti", dialCode: "+509", flag: "🇭🇹" },
    { code: "HU", name: "Hungary", dialCode: "+36", flag: "🇭🇺" },
    { code: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
    { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
    { code: "IL", name: "Israel", dialCode: "+972", flag: "🇮🇱" },
    { code: "IM", name: "Isle of Man", dialCode: "+44", flag: "🇮🇲" },
    { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
    {
      code: "IO",
      name: "British Indian Ocean Territory",
      dialCode: "+246",
      flag: "🇮🇴",
    },
    { code: "IQ", name: "Iraq", dialCode: "+964", flag: "🇮🇶" },
    { code: "IR", name: "Iran", dialCode: "+98", flag: "🇮🇷" },
    { code: "IS", name: "Iceland", dialCode: "+354", flag: "🇮🇸" },
    { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
    { code: "JE", name: "Jersey", dialCode: "+44", flag: "🇯🇪" },
    { code: "JM", name: "Jamaica", dialCode: "+1", flag: "🇯🇲" },
    { code: "JO", name: "Jordan", dialCode: "+962", flag: "🇯🇴" },
    { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
    { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
    { code: "KG", name: "Kyrgyzstan", dialCode: "+996", flag: "🇰🇬" },
    { code: "KH", name: "Cambodia", dialCode: "+855", flag: "🇰🇭" },
    { code: "KI", name: "Kiribati", dialCode: "+686", flag: "🇰🇮" },
    { code: "KM", name: "Comoros", dialCode: "+269", flag: "🇰🇲" },
    { code: "KN", name: "Saint Kitts and Nevis", dialCode: "+1", flag: "🇰🇳" },
    { code: "KP", name: "North Korea", dialCode: "+850", flag: "🇰🇵" },
    { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" },
    { code: "KW", name: "Kuwait", dialCode: "+965", flag: "🇰🇼" },
    { code: "KY", name: "Cayman Islands", dialCode: "+1", flag: "🇰🇾" },
    { code: "KZ", name: "Kazakhstan", dialCode: "+7", flag: "🇰🇿" },
    { code: "LA", name: "Laos", dialCode: "+856", flag: "🇱🇦" },
    { code: "LB", name: "Lebanon", dialCode: "+961", flag: "🇱🇧" },
    { code: "LC", name: "Saint Lucia", dialCode: "+1", flag: "🇱🇨" },
    { code: "LI", name: "Liechtenstein", dialCode: "+423", flag: "🇱🇮" },
    { code: "LK", name: "Sri Lanka", dialCode: "+94", flag: "🇱🇰" },
    { code: "LR", name: "Liberia", dialCode: "+231", flag: "🇱🇷" },
    { code: "LS", name: "Lesotho", dialCode: "+266", flag: "🇱🇸" },
    { code: "LT", name: "Lithuania", dialCode: "+370", flag: "🇱🇹" },
    { code: "LU", name: "Luxembourg", dialCode: "+352", flag: "🇱🇺" },
    { code: "LV", name: "Latvia", dialCode: "+371", flag: "🇱🇻" },
    { code: "LY", name: "Libya", dialCode: "+218", flag: "🇱🇾" },
    { code: "MA", name: "Morocco", dialCode: "+212", flag: "🇲🇦" },
    { code: "MC", name: "Monaco", dialCode: "+377", flag: "🇲🇨" },
    { code: "MD", name: "Moldova", dialCode: "+373", flag: "🇲🇩" },
    { code: "ME", name: "Montenegro", dialCode: "+382", flag: "🇲🇪" },
    { code: "MF", name: "Saint Martin", dialCode: "+590", flag: "🇲🇫" },
    { code: "MG", name: "Madagascar", dialCode: "+261", flag: "🇲🇬" },
    { code: "MH", name: "Marshall Islands", dialCode: "+692", flag: "🇲🇭" },
    { code: "MK", name: "North Macedonia", dialCode: "+389", flag: "🇲🇰" },
    { code: "ML", name: "Mali", dialCode: "+223", flag: "🇲🇱" },
    { code: "MM", name: "Myanmar", dialCode: "+95", flag: "🇲🇲" },
    { code: "MN", name: "Mongolia", dialCode: "+976", flag: "🇲🇳" },
    { code: "MO", name: "Macao", dialCode: "+853", flag: "🇲🇴" },
    {
      code: "MP",
      name: "Northern Mariana Islands",
      dialCode: "+1",
      flag: "🇲🇵",
    },
    { code: "MQ", name: "Martinique", dialCode: "+596", flag: "🇲🇶" },
    { code: "MR", name: "Mauritania", dialCode: "+222", flag: "🇲🇷" },
    { code: "MS", name: "Montserrat", dialCode: "+1", flag: "🇲🇸" },
    { code: "MT", name: "Malta", dialCode: "+356", flag: "🇲🇹" },
    { code: "MU", name: "Mauritius", dialCode: "+230", flag: "🇲🇺" },
    { code: "MV", name: "Maldives", dialCode: "+960", flag: "🇲🇻" },
    { code: "MW", name: "Malawi", dialCode: "+265", flag: "🇲🇼" },
    { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
    { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
    { code: "MZ", name: "Mozambique", dialCode: "+258", flag: "🇲🇿" },
    { code: "NA", name: "Namibia", dialCode: "+264", flag: "🇳🇦" },
    { code: "NC", name: "New Caledonia", dialCode: "+687", flag: "🇳🇨" },
    { code: "NE", name: "Niger", dialCode: "+227", flag: "🇳🇪" },
    { code: "NF", name: "Norfolk Island", dialCode: "+672", flag: "🇳🇫" },
    { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
    { code: "NI", name: "Nicaragua", dialCode: "+505", flag: "🇳🇮" },
    { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
    { code: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴" },
    { code: "NP", name: "Nepal", dialCode: "+977", flag: "🇳🇵" },
    { code: "NR", name: "Nauru", dialCode: "+674", flag: "🇳🇷" },
    { code: "NU", name: "Niue", dialCode: "+683", flag: "🇳🇺" },
    { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
    { code: "OM", name: "Oman", dialCode: "+968", flag: "🇴🇲" },
    { code: "PA", name: "Panama", dialCode: "+507", flag: "🇵🇦" },
    { code: "PE", name: "Peru", dialCode: "+51", flag: "🇵🇪" },
    { code: "PF", name: "French Polynesia", dialCode: "+689", flag: "🇵🇫" },
    { code: "PG", name: "Papua New Guinea", dialCode: "+675", flag: "🇵🇬" },
    { code: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
    { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
    { code: "PL", name: "Poland", dialCode: "+48", flag: "🇵🇱" },
    {
      code: "PM",
      name: "Saint Pierre and Miquelon",
      dialCode: "+508",
      flag: "🇵🇲",
    },
    { code: "PN", name: "Pitcairn Islands", dialCode: "+64", flag: "🇵🇳" },
    { code: "PR", name: "Puerto Rico", dialCode: "+1", flag: "🇵🇷" },
    { code: "PS", name: "Palestine", dialCode: "+970", flag: "🇵🇸" },
    { code: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
    { code: "PW", name: "Palau", dialCode: "+680", flag: "🇵🇼" },
    { code: "PY", name: "Paraguay", dialCode: "+595", flag: "🇵🇾" },
    { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
    { code: "RE", name: "Réunion", dialCode: "+262", flag: "🇷🇪" },
    { code: "RO", name: "Romania", dialCode: "+40", flag: "🇷🇴" },
    { code: "RS", name: "Serbia", dialCode: "+381", flag: "🇷🇸" },
    { code: "RU", name: "Russia", dialCode: "+7", flag: "🇷🇺" },
    { code: "RW", name: "Rwanda", dialCode: "+250", flag: "🇷🇼" },
    { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
    { code: "SB", name: "Solomon Islands", dialCode: "+677", flag: "🇸🇧" },
    { code: "SC", name: "Seychelles", dialCode: "+248", flag: "🇸🇨" },
    { code: "SD", name: "Sudan", dialCode: "+249", flag: "🇸🇩" },
    { code: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪" },
    { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
    { code: "SH", name: "Saint Helena", dialCode: "+290", flag: "🇸🇭" },
    { code: "SI", name: "Slovenia", dialCode: "+386", flag: "🇸🇮" },
    { code: "SJ", name: "Svalbard and Jan Mayen", dialCode: "+47", flag: "🇸🇯" },
    { code: "SK", name: "Slovakia", dialCode: "+421", flag: "🇸🇰" },
    { code: "SL", name: "Sierra Leone", dialCode: "+232", flag: "🇸🇱" },
    { code: "SM", name: "San Marino", dialCode: "+378", flag: "🇸🇲" },
    { code: "SN", name: "Senegal", dialCode: "+221", flag: "🇸🇳" },
    { code: "SO", name: "Somalia", dialCode: "+252", flag: "🇸🇴" },
    { code: "SR", name: "Suriname", dialCode: "+597", flag: "🇸🇷" },
    { code: "SS", name: "South Sudan", dialCode: "+211", flag: "🇸🇸" },
    { code: "ST", name: "São Tomé and Príncipe", dialCode: "+239", flag: "🇸🇹" },
    { code: "SV", name: "El Salvador", dialCode: "+503", flag: "🇸🇻" },
    { code: "SX", name: "Sint Maarten", dialCode: "+1", flag: "🇸🇽" },
    { code: "SY", name: "Syria", dialCode: "+963", flag: "🇸🇾" },
    { code: "SZ", name: "Eswatini", dialCode: "+268", flag: "🇸🇿" },
    {
      code: "TC",
      name: "Turks and Caicos Islands",
      dialCode: "+1",
      flag: "🇹🇨",
    },
    { code: "TD", name: "Chad", dialCode: "+235", flag: "🇹🇩" },
    {
      code: "TF",
      name: "French Southern Territories",
      dialCode: "+262",
      flag: "🇹🇫",
    },
    { code: "TG", name: "Togo", dialCode: "+228", flag: "🇹🇬" },
    { code: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭" },
    { code: "TJ", name: "Tajikistan", dialCode: "+992", flag: "🇹🇯" },
    { code: "TK", name: "Tokelau", dialCode: "+690", flag: "🇹🇰" },
    { code: "TL", name: "Timor-Leste", dialCode: "+670", flag: "🇹🇱" },
    { code: "TM", name: "Turkmenistan", dialCode: "+993", flag: "🇹🇲" },
    { code: "TN", name: "Tunisia", dialCode: "+216", flag: "🇹🇳" },
    { code: "TO", name: "Tonga", dialCode: "+676", flag: "🇹🇴" },
    { code: "TR", name: "Turkey", dialCode: "+90", flag: "🇹🇷" },
    { code: "TT", name: "Trinidad and Tobago", dialCode: "+1", flag: "🇹🇹" },
    { code: "TV", name: "Tuvalu", dialCode: "+688", flag: "🇹🇻" },
    { code: "TW", name: "Taiwan", dialCode: "+886", flag: "🇹🇼" },
    { code: "TZ", name: "Tanzania", dialCode: "+255", flag: "🇹🇿" },
    { code: "UA", name: "Ukraine", dialCode: "+380", flag: "🇺🇦" },
    { code: "UG", name: "Uganda", dialCode: "+256", flag: "🇺🇬" },
    {
      code: "UM",
      name: "United States Minor Outlying Islands",
      dialCode: "+1",
      flag: "🇺🇲",
    },
    { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
    { code: "UY", name: "Uruguay", dialCode: "+598", flag: "🇺🇾" },
    { code: "UZ", name: "Uzbekistan", dialCode: "+998", flag: "🇺🇿" },
    { code: "VA", name: "Vatican City", dialCode: "+379", flag: "🇻🇦" },
    {
      code: "VC",
      name: "Saint Vincent and the Grenadines",
      dialCode: "+1",
      flag: "🇻🇨",
    },
    { code: "VE", name: "Venezuela", dialCode: "+58", flag: "🇻🇪" },
    { code: "VG", name: "British Virgin Islands", dialCode: "+1", flag: "🇻🇬" },
    { code: "VI", name: "U.S. Virgin Islands", dialCode: "+1", flag: "🇻🇮" },
    { code: "VN", name: "Vietnam", dialCode: "+84", flag: "🇻🇳" },
    { code: "VU", name: "Vanuatu", dialCode: "+678", flag: "🇻🇺" },
    { code: "WF", name: "Wallis and Futuna", dialCode: "+681", flag: "🇼🇫" },
    { code: "WS", name: "Samoa", dialCode: "+685", flag: "🇼🇸" },
    { code: "YE", name: "Yemen", dialCode: "+967", flag: "🇾🇪" },
    { code: "YT", name: "Mayotte", dialCode: "+262", flag: "🇾🇹" },
    { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
    { code: "ZM", name: "Zambia", dialCode: "+260", flag: "🇿🇲" },
    { code: "ZW", name: "Zimbabwe", dialCode: "+263", flag: "🇿🇼" },
  ];

  // Time slots for calendar - Full 24h (00:00 to 24:00 in 30-minute intervals), X-axis
  const timeSlots = [
    "00:00",
    "00:30",
    "01:00",
    "01:30",
    "02:00",
    "02:30",
    "03:00",
    "03:30",
    "04:00",
    "04:30",
    "05:00",
    "05:30",
    "06:00",
    "06:30",
    "07:00",
    "07:30",
    "08:00",
    "08:30",
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
    "22:30",
    "23:00",
    "23:30",
    "24:00",
  ];

  // Options for "Are you here for" dropdown
  const hereForOptions = [
    { value: "", label: "-Select-" },
    { value: "new-boat", label: "New Boat" },
    { value: "pre-owned", label: "Pre-Owned" },
    { value: "charter", label: "Charter" },
    { value: "curiosity", label: "Just Curiosity" },
    { value: "marketing", label: "Marketing" },
  ];

  // Utility Functions
  const getInspectorInitial = (inspectorName: string): string => {
    if (!inspectorName) return "??";

    const words = inspectorName.trim().split(" ");
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }

    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  };

  // === Name matching utils (case-insensitive, accent-insensitive, token/partial) ===
  const normalize = (s: string | undefined | null) => {
    if (!s || typeof s !== "string") return "";
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Exact name matching only (no more token-based partial matching)
  const nameMatches = (
    a: string | undefined | null,
    b: string | undefined | null
  ) => {
    if (!a || !b || typeof a !== "string" || typeof b !== "string")
      return false;
    return normalize(a) === normalize(b);
  };

  // Get all time slots that an event covers with coverage percentage
  const getTimeSlotsCovered = (
    startDate: Date,
    endDate: Date
  ): Array<{ slot: string; coverage: number }> => {
    const slots: Array<{ slot: string; coverage: number }> = [];

    if (!selectedTimezone) {
      return slots; // Return empty array if no timezone
    }

    const startTime = startDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: selectedTimezone,
    });

    const endTime = endDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: selectedTimezone,
    });

    let startHour = parseInt(startTime.split(":")[0]);
    let startMinute = parseInt(startTime.split(":")[1]);
    let endHour = parseInt(endTime.split(":")[0]);
    let endMinute = parseInt(endTime.split(":")[1]);

    // 🔑 Fix: if event ends before it starts → crosses midnight
    if (
      endHour < startHour ||
      (endHour === startHour && endMinute < startMinute)
    ) {
      endHour += 24; // push end into "next day"
    }

    // Convert to minutes for easier calculation
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    // Find which time slots the event covers using the actual timeSlots array
    for (let i = 0; i < timeSlots.length; i++) {
      const timeSlot = timeSlots[i];
      const [slotHour, slotMinute] = timeSlot.split(":").map(Number);
      const slotStartMinutes = slotHour * 60 + slotMinute;
      const slotEndMinutes = slotStartMinutes + 30; // Each slot is 30 minutes

      // Check if this time slot overlaps with the event
      if (
        slotStartMinutes < endTotalMinutes &&
        slotEndMinutes > startTotalMinutes
      ) {
        // Calculate coverage percentage for this slot
        const overlapStart = Math.max(startTotalMinutes, slotStartMinutes);
        const overlapEnd = Math.min(endTotalMinutes, slotEndMinutes);
        const overlapDuration = overlapEnd - overlapStart;
        const coverage = (overlapDuration / 30) * 100; // 30 minutes per slot

        if (coverage > 0) {
          slots.push({ slot: timeSlot, coverage: Math.round(coverage) });
        }
      }
    }

    return slots;
  };

  // Update current date and time
  const updateCurrentDateTime = () => {
    if (!selectedTimezone || !selectedCountry) {
      setCurrentDateTime("Loading timezone...");
      return;
    }

    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: selectedTimezone,
    };

    const now = new Date();
    const countryTime = now.toLocaleString("en-US", options);
    setCurrentDateTime(`${countryTime} (${selectedCountry})`);
  };

  // Start real-time date/time updates
  useEffect(() => {
    updateCurrentDateTime();
    const interval = setInterval(updateCurrentDateTime, 1000);
    return () => clearInterval(interval);
  }, [selectedTimezone, selectedCountry]);

  // Check for saved summary data on component mount (after page refresh)
  useEffect(() => {
    const savedSummaryData = localStorage.getItem("sunreef-form-summary");
    if (savedSummaryData) {
      try {
        const parsedData = JSON.parse(savedSummaryData);
        setSummaryData(parsedData);
        setShowSummary(true);

        // Auto-scroll to top when summary is restored (Enhanced for iPad)
        setTimeout(() => {
          // Multiple scroll methods for better iPad compatibility
          window.scrollTo({ top: 0, behavior: "smooth" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;

          // Additional scroll for iPad Safari
          setTimeout(() => {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          }, 50);
        }, 100);

        // Clear the saved data after showing it
        localStorage.removeItem("sunreef-form-summary");
      } catch (error) {
        console.error("Error parsing saved summary data:", error);
        localStorage.removeItem("sunreef-form-summary");
      }
    }
  }, []);

  // Centralized function to close summary and reset the form
  const closeSummaryAndRefresh = () => {
    // Clear localStorage and close summary
    localStorage.removeItem("sunreef-form-summary");
    setShowSummary(false);
    setSummaryData(null);
    // Ask the parent to remount this component (fresh state) instead of reloading the whole page
    onRefresh?.();
  };

  // Load real events and team members on component mount
  useEffect(() => {
    loadRealEvents();
    loadTeamMembersFromCreator();
  }, []);

  // Load all events when event dates are available
  useEffect(() => {
    if (eventStartDate && eventEndDate) {
      loadAllEvents();
    }
  }, [eventStartDate, eventEndDate]);

  // Update currentSelectedDate when event dates change
  useEffect(() => {
    if (eventStartDate) {
      const newDefaultDate = getDefaultDate();
      const newDate = new Date(newDefaultDate);
      if (!isNaN(newDate.getTime())) {
        setCurrentSelectedDate(newDate);
      }
    }
  }, [eventStartDate, eventEndDate]);

  // Update form times when timezone becomes available
  useEffect(() => {
    if (selectedTimezone) {
      try {
        const currentTime = getCurrentCountryTime();
        setFormData((prev) => ({
          ...prev,
          fromTime: currentTime,
          toTime: add30Minutes(currentTime),
        }));
      } catch (error) {
        console.error("Error updating form times:", error);
      }
    }
  }, [selectedTimezone]);

  // Load all events for all festival dates to show time slots
  const loadAllEvents = async () => {
    try {
      // Validate that event dates are available
      if (!eventStartDate || !eventEndDate) {
        console.error("❌ Cannot load events: Event dates not available");
        return;
      }

      // Convert dates to the format expected by the API (DD-MM-YYYY)
      const convertToAPIDateFormat = (dateStr: string): string => {
        if (!dateStr) return "";
        const date = new Date(convertDateFormat(dateStr));
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear().toString();
        return `${day}-${month}-${year}`;
      };

      const apiStartDate = convertToAPIDateFormat(eventStartDate);
      const apiEndDate = convertToAPIDateFormat(eventEndDate);

      const response = await yachtAPI.getAllEvents(apiStartDate, apiEndDate);

      if (!response) {
        return;
      }

      if (response?.data && Array.isArray(response.data)) {
        const newEvents = new Map<string, CalendarEvent[]>();

        response.data.forEach((event: any, index: number) => {
          try {
            // Validate that start_date exists and is valid
            if (!event.start_date) {
              return;
            }

            const startDate = new Date(event.start_date);

            // Check if date is valid
            if (isNaN(startDate.getTime())) {
              return;
            }

            // Parse the start time and end time in selected country timezone
            const startTime = selectedTimezone
              ? startDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: selectedTimezone,
                })
              : startDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });

            // Parse end time
            const endDate = new Date(event.end_date);
            const endTime = selectedTimezone
              ? endDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: selectedTimezone,
                })
              : endDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });

            // Create time range display
            const timeRange = `${startTime}-${endTime}`;

            // Get the date for filtering in selected country timezone
            const eventDate = selectedTimezone
              ? startDate.toLocaleDateString("en-CA", {
                  timeZone: selectedTimezone,
                })
              : startDate.toLocaleDateString("en-CA");

            // Create event key with inspector name and time (normalize case for consistency)
            const normalizedName = event.name.trim();

            // Debug: Check if this inspector exists in our inspector list

            // Calculate all time slots this event spans
            const timeSlotsToCover = getTimeSlotsCovered(startDate, endDate);

            // Create calendar event object
            const calendarEvent: CalendarEvent = {
              title: `${event.org === "main" ? "Main" : "Other"} Meeting - ${
                event.client?.name || "No Client"
              } (${timeRange})`,
              type: event.org.toLowerCase(),
              inspector: normalizedName,
              time: startTime,
              date: eventDate,
              timeRange: timeRange,
              org: event.org,
              client: event.client,
            };

            // Add event to all time slots it covers
            timeSlotsToCover.forEach((timeSlotInfo, index) => {
              const eventKey = `${normalizedName}-${timeSlotInfo.slot}`;

              if (!newEvents.has(eventKey)) {
                newEvents.set(eventKey, []);
              }

              // Create a copy of the event for each time slot with coverage info
              const timeSlotEvent = {
                ...calendarEvent,
                time: timeSlotInfo.slot,
                coverage: timeSlotInfo.coverage,
                isFirst: index === 0,
                isLast: index === timeSlotsToCover.length - 1,
                totalSlots: timeSlotsToCover.length,
                slotIndex: index,
              };

              newEvents.get(eventKey)!.push(timeSlotEvent);
            });
          } catch (error) {
            console.error(`Error processing event ${index + 1}:`, event, error);
          }
        });

        // Prevent overwriting existing meetings with an empty dataset
        if (newEvents.size > 0) {
          setCalendarEvents(newEvents);
        }

        // Debug: Show current inspectors vs event names for comparison

        const eventInspectors = [
          ...new Set(
            Array.from(newEvents.keys()).map((key) => {
              const lastDashIndex = key.lastIndexOf("-");
              return key.substring(0, lastDashIndex);
            })
          ),
        ];

        // Check for exact matches
        const exactMatches = eventInspectors.filter((eventInsp) =>
          inspectors.some(
            (inspector) => inspector.toLowerCase() === eventInsp.toLowerCase()
          )
        );

        // Check for partial matches
        const partialMatches = eventInspectors.filter((eventInsp) => {
          if (
            exactMatches.some(
              (exact) => exact.toLowerCase() === eventInsp.toLowerCase()
            )
          )
            return false;

          return inspectors.some((inspector) => {
            const inspectorLower = inspector.toLowerCase();
            const eventInspLower = eventInsp.toLowerCase();
            return (
              inspectorLower.includes(eventInspLower) ||
              eventInspLower.includes(inspectorLower)
            );
          });
        });

        // Check for unmatched
        const unmatched = eventInspectors.filter(
          (eventInsp) =>
            !exactMatches.some(
              (exact) => exact.toLowerCase() === eventInsp.toLowerCase()
            ) &&
            !partialMatches.some(
              (partial) => partial.toLowerCase() === eventInsp.toLowerCase()
            )
        );
        if (unmatched.length > 0) {
        }
      } else {
      }
    } catch (error) {
      console.error("❌ Error loading all events:", error);
    }
  };

  // Load all inspectors and events once on component mount
  useEffect(() => {
    // loadAllInspectors(); // Removed - now handled in loadRealEvents
    // loadAllEvents(); // Removed - now handled in loadRealEvents
  }, []);

  // Debug: Log when tourGivenByOptions changes
  useEffect(() => {}, [tourGivenByOptions]);

  // Scroll to top when page refreshes
  useEffect(() => {
    // Force scroll to top and prevent scroll restoration
    window.scrollTo(0, 0);

    // Additional scroll to top after a short delay to ensure it works
    const timer = setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Enhanced scroll to top when summary becomes visible (iPad optimized)
  useEffect(() => {
    if (showSummary) {
      // Lock body scroll to prevent background scrolling on iPad
      document.body.classList.add("summary-open");
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.height = "100%";

      // Immediate scroll to top
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // Focus on summary modal after a short delay
      setTimeout(() => {
        if (summaryRef.current) {
          summaryRef.current.focus();
          // Center the modal in viewport
          summaryRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);

      // Gentle scroll prevention (less aggressive for iPad)
      const handleScroll = (e: Event) => {
        // Only prevent scroll if it's not within the modal
        if (
          summaryRef.current &&
          !summaryRef.current.contains(e.target as Node)
        ) {
          e.preventDefault();
          window.scrollTo(0, 0);
        }
      };

      // Add scroll event listener with passive: false to allow preventDefault
      window.addEventListener("scroll", handleScroll, { passive: false });
      document.addEventListener("scroll", handleScroll, { passive: false });

      // Single delayed scroll for iPad Safari
      const timer = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("scroll", handleScroll);
        document.removeEventListener("scroll", handleScroll);

        // Restore body scroll
        document.body.classList.remove("summary-open");
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.height = "";
      };
    }
  }, [showSummary]);
  // ⬇️ Ye naya effect yahin paste karo
  // Debug: CRM list vs Event names (normalized comparisons)
  useEffect(() => {
    if (!inspectors.length || !calendarEvents.size) return;

    const eventInspectors = [
      ...new Set(
        Array.from(calendarEvents.keys()).map((k) =>
          k.slice(0, k.lastIndexOf("-"))
        )
      ),
    ];

    // ✅ normalized exact match (hyphen/space, case, accents sab handle)
    const exact = eventInspectors.filter(
      (ei) =>
        ei &&
        typeof ei === "string" &&
        inspectors.some(
          (i) => i && typeof i === "string" && normalize(i) === normalize(ei)
        )
    );

    // 🟡 partial match (token/substring) — nameMatches already normalizes
    const partial = eventInspectors.filter(
      (ei) =>
        ei &&
        typeof ei === "string" &&
        !exact.some((x) => normalize(x) === normalize(ei)) &&
        inspectors.some((i) => i && typeof i === "string" && nameMatches(i, ei))
    );
    void partial; // silence unused when not needed

    // ❌ still unmatched after exact + partial (computed previously if needed)
    // Note: we no longer need the list here; removing to avoid unused var

    // OPTIONAL: event-only names ko list me merge karna ho to uncomment karo:
    /*
  if (unmatched.length) {
    setInspectors(prev =>
      uniqByNormalized([...prev, ...unmatched])
        .map(toTitleCase)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    );
  }
  */
  }, [inspectors, calendarEvents]);

  // No need to load events when date changes since users remain the same
  // useEffect(() => {
  //   loadEventsForDate(currentSelectedDate);
  // }, [currentSelectedDate]);

  // Date validation function - simplified since To date uses fromDate automatically
  const validateDates = (fromDate: string): boolean => {
    if (!fromDate) return true; // Allow empty from date

    // Just ensure from date is valid
    const from = new Date(fromDate);
    return !isNaN(from.getTime());
  };

  // Ref for date input (Pikaday)
  const fromDateInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Pikaday for the fromDate field
  useEffect(() => {
    if (!(window as any).Pikaday) return; // CDN not loaded yet
    if (!fromDateInputRef.current) return;

    // Destroy existing instance if any
    try {
      (fromDateInputRef.current as any)._pikaday?.destroy?.();
    } catch (_) {}

    const picker = new (window as any).Pikaday({
      field: fromDateInputRef.current,
      format: "D-MMM-YYYY", // display format only
      setDefaultDate: !!formData.fromDate,
      defaultDate: formData.fromDate ? new Date(formData.fromDate) : undefined,
      onSelect: (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const iso = `${y}-${m}-${d}`; // keep internal value ISO for backend
        handleInputChange({
          target: { name: "fromDate", value: iso, type: "text" },
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      },
    });
    (fromDateInputRef.current as any)._pikaday = picker;

    return () => {
      try {
        picker.destroy();
      } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDateInputRef]);

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => {
        const updated: any = { ...prev };

        if (name === "mobile") {
          const numericOnly = value.replace(/[^0-9]/g, "");
          updated.mobile = numericOnly;
        } else {
          (updated as any)[name] = value;
        }

        if (name === "fromTime" && value) {
          updated.toTime = add30Minutes(value);
        }

        if (name === "fromDate" || name === "fromTime" || name === "toTime") {
          const isValid = validateDates(updated.fromDate);
          if (!isValid) {
            setDateValidationError("Please select a valid date.");
            return prev; // Skip update on invalid date
          } else {
            setDateValidationError("");
          }
        }

        if (name === "email") {
          // Clear as soon as they start fixing it; it is re-checked on blur.
          setEmailInvalid(false);
        }

        if (name === "email" && !value.trim()) {
          setEmailSearchResult(null);
          setEnrichedData(null);
          pendingCrmRecordsRef.current = [];
          pendingCrmEventsRef.current = [];
          pendingCrmEventsErrorRef.current = undefined;
        }

        if (name === "hereFor") {
          updated.interestedCharter = value === "charter" ? true : null;
        }

        return updated;
      });
    }
  };

  // Helper function to convert timezone to selected country timezone and format
  const formatDateTimeToCountryTimezone = (dateTimeString: string) => {
    try {
      if (!selectedTimezone) {
        throw new Error("Selected timezone is required");
      }

      const date = new Date(dateTimeString);

      // Convert to selected country timezone
      const countryTime = date.toLocaleString("en-US", {
        timeZone: selectedTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // Format: DD/MM/YYYY HH:MM
      const [datePart, timePart] = countryTime.split(", ");
      const [month, day, year] = datePart.split("/");
      const formattedDate = `${day}/${month}/${year}`;

      return {
        date: formattedDate,
        time: timePart,
        full: `${formattedDate} ${timePart}`,
      };
    } catch (error) {
      console.error("Error formatting date:", error);
      return {
        date: "Invalid Date",
        time: "Invalid Time",
        full: "Invalid Date/Time",
      };
    }
  };

  // Map wealth category string → CSS modifier class and display label.
  const wealthCategoryMeta = (
    category: string | null | undefined
  ): { cls: string; label: string } => {
    const c = (category || "").toLowerCase();
    if (c.includes("billionaire"))
      return { cls: "billionaire", label: "Billionaire" };
    if (c.includes("uhnw") || c.includes("ultra"))
      return { cls: "uhnw", label: "UHNW" };
    if (c.includes("hnw") || c.includes("high net"))
      return { cls: "hnw", label: "HNW" };
    return { cls: "general", label: "General" };
  };

  // Build email search message lines (shared by search + enrichment update)
  const buildEmailMessage = (
    records: any[],
    overrideWealthCategory?: string
  ): string => {
    const orgNameMap: Record<string, string> = { main: "SY", other: "SYC" };
    const recordsByOrg: Record<string, any> = {};
    records.forEach((record: any) => {
      const key = record._org || "main";
      if (!recordsByOrg[key]) recordsByOrg[key] = record;
    });
    const lines: string[] = [];
    for (const [orgKey, record] of Object.entries(recordsByOrg)) {
      const orgLabel = orgNameMap[orgKey] || orgKey.toUpperCase();
      const ownerName =
        record?.Owner?.name || record?.Owner?.$name || "Unknown";
      const firstName = record?.First_Name || record?.first_name || "";
      const lastName = record?.Last_Name || record?.last_name || "";
      const clientName = `${firstName} ${lastName}`.trim() || "Unknown";
      const wealthCategory = overrideWealthCategory || "—";
      const line = `[${orgLabel}] Email is associated with "${clientName}", Client is "${wealthCategory}" and is with "${ownerName}"`;
      lines.push(line);
    }
    return lines.join("\n");
  };

  // Handle email search
  const handleEmailSearch = async (email: string) => {
    if (!email || email.length < 3) {
      setEmailSearchResult(null);
      return;
    }

    // Reset pending refs on new search
    pendingCrmRecordsRef.current = [];
    pendingCrmEventsRef.current = [];
    pendingCrmEventsErrorRef.current = undefined;

    setIsSearchingEmail(true);
    try {
      const result = await yachtAPI.searchUserByEmail(email);
      if (result.success && result.exists) {
        // Use first Lead record for event fetching
        const leadRecord = result.data.find(
          (r: any) => r._module !== "Contacts"
        );
        const recordId = leadRecord?.id || null;

        // Fetch related events in parallel — store in refs, don't show message yet
        let events: any[] = [];
        let eventsError: string | undefined = undefined;
        if (recordId) {
          try {
            const eventsResult = await yachtAPI.getRelatedEventsBoth(recordId);
            if (eventsResult.success) {
              events = [
                ...(eventsResult.results.main.events || []),
                ...(eventsResult.results.other.events || []),
              ];
            } else {
              eventsError =
                eventsResult.error ||
                eventsResult.message ||
                "Failed to fetch events";
            }
          } catch (err: any) {
            eventsError = err?.message || "Network error while fetching events";
          }
        }

        // Store for enrichment to consume
        pendingCrmRecordsRef.current = result.data;
        pendingCrmEventsRef.current = events;
        pendingCrmEventsErrorRef.current = eventsError;

        // If enrichment won't run (missing firstName, lastName, or mobile),
        // show the message now with "—" as client segment
        const { firstName, lastName, mobile } = formData;
        if (!firstName || !lastName || !mobile) {
          setEmailSearchResult({
            exists: true,
            data: result.data,
            message: buildEmailMessage(result.data),
            events,
            eventsError,
          });
        }
      } else {
        // No user found — clear immediately
        setEmailSearchResult({ exists: false, data: [], message: "" });
      }
    } catch (error) {
      console.error("Error searching for email:", error);
      setEmailSearchResult(null);
    } finally {
      setIsSearchingEmail(false);
    }
  };

  // Trigger lead enrichment when all 4 required fields are present
  const handleEnrichment = async (overrideData?: Partial<typeof formData>) => {
    const data = { ...formData, ...overrideData };
    const { firstName, lastName, email, mobile } = data;
    if (!firstName || !lastName || !email || !mobile) return;

    setIsEnriching(true);
    try {
      const mobileWithDialCode = selectedCountryCode
        ? `${selectedCountryCode.dialCode}${mobile}`
        : mobile;
      const result = await yachtAPI.enrichLead({
        firstName,
        lastName,
        email,
        mobile: mobileWithDialCode,
        country:
          countries.find((c) => c.code === data.country)?.name ||
          data.country ||
          "",
      });
      if (result.success) {
        setEnrichedData({
          wealthCategory: result.wealthCategory,
          aiLeadScore: result.aiLeadScore,
          profileSummary: result.profileSummary,
        });
        // Update the email search message with the enriched wealth category
        // Now show the email message — CRM records were held in the refs
        if (pendingCrmRecordsRef.current.length > 0) {
          setEmailSearchResult({
            exists: true,
            data: pendingCrmRecordsRef.current,
            message: buildEmailMessage(
              pendingCrmRecordsRef.current,
              result.wealthCategory
            ),
            events: pendingCrmEventsRef.current,
            eventsError: pendingCrmEventsErrorRef.current,
          });
        }
      }
    } catch (err) {
      console.error("Enrichment failed:", err);
      // Enrichment failed — still show message if CRM found a record (no wealth category override)
      if (pendingCrmRecordsRef.current.length > 0) {
        setEmailSearchResult({
          exists: true,
          data: pendingCrmRecordsRef.current,
          message: buildEmailMessage(pendingCrmRecordsRef.current),
          events: pendingCrmEventsRef.current,
          eventsError: pendingCrmEventsErrorRef.current,
        });
      }
      // If no CRM records and enrichment failed, nothing meaningful to show
    } finally {
      setIsEnriching(false);
    }
  };

  // Handle radio button changes with conditional field logic and deselection
  const handleRadioChange = (name: string, value: string) => {
    setFormData((prev) => {
      // Broker is a plain boolean (no deselect): Yes = ticked, No = not ticked
      if (name === "isBroker") {
        return { ...prev, isBroker: value === "true" };
      }

      // Special handling for boolean fields
      if (name === "interestedCharter" || name === "currentOwner") {
        const boolValue = value === "true";
        // If clicking the same value, deselect it (set to null)
        if ((prev as any)[name] === boolValue) {
          return { ...prev, [name]: null };
        }
        // Otherwise, select the new value
        return { ...prev, [name]: boolValue };
      }

      // For string fields, if clicking the same value, deselect it (set to empty string)
      if ((prev as any)[name] === value) {
        return { ...prev, [name]: "" };
      }
      // Otherwise, select the new value
      return { ...prev, [name]: value };
    });
  };

  // Custom radio button component that supports deselection
  const CustomRadioButton = ({
    name,
    value,
    label,
    checked,
    onChange,
  }: {
    name: string;
    value: string;
    label: string;
    checked: boolean;
    onChange: (name: string, value: string) => void;
  }) => (
    <div className="radio-option">
      <div
        className={`custom-radio-button ${checked ? "selected" : "unselected"}`}
        onClick={() => onChange(name, value)}
        style={{
          cursor: "pointer",
          padding: "8px 16px",
          border: checked ? "2px solid #0e1cec" : "2px solid #e1e8ed",
          borderRadius: "20px",
          backgroundColor: checked ? "#0e1cec" : "white",
          color: checked ? "white" : "#2c3e50",
          display: "inline-block",
          transition: "all 0.3s ease",
          fontWeight: "500",
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        {label}
      </div>
    </div>
  );

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const missingFields = [];

    if (!formData.firstName) missingFields.push("First Name");
    if (!formData.mobile) missingFields.push("Mobile");
    if (!formData.email) missingFields.push("Email");
    if (!formData.hereFor) missingFields.push("Purpose of Visit");

    // Check postal code requirement for FLIBS boat show
    if (isPostalCodeRequired() && !formData.postal) {
      missingFields.push("Postal Code");
    }

    if (missingFields.length > 0) {
      alert(`Please fill in all required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Email format — type="email" lets "guest@gmail" and ".con" through
    if (!isValidEmail(formData.email)) {
      setEmailInvalid(true);
      alert("Invalid email");
      return;
    }

    // Country code validation
    if (!selectedCountryCode) {
      alert("Please select a country code for your mobile number");
      return;
    }

    // Show loading state
    const submitButton = e.currentTarget.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    const originalText = submitButton.textContent;
    submitButton.textContent = "Submitting...";
    submitButton.disabled = true;

    try {
      // Combine country code with mobile number (no leading +)
      const mobileWithCountryCode = selectedCountryCode
        ? `${selectedCountryCode.dialCode.replace(/^\+/, "")}${formData.mobile}`
        : formData.mobile;

      // Create form data with combined mobile number
      const formDataWithCountryCode = {
        ...formData,
        mobile: mobileWithCountryCode,
      };

      // Get the selected show data to extract Creator_App_Name and Boat_Show_Name
      const selectedShowData = getSelectedShowData();
      if (!selectedShowData || !selectedShowData.Creator_App_Name) {
        throw new Error("No selected show data or Creator_App_Name found");
      }

      // Add Boat_Show_Name and Campaign IDs to form data for CRM
      const boatShowName =
        selectedShowData.Boat_Show_Name || selectedShowData.Event_Heading;
      if (!boatShowName || boatShowName.trim() === "") {
        throw new Error("No boat show name found in selected show data");
      }

      const sunreefYachtCampaignId = selectedShowData.Sunreef_Yacht_Campaign_ID;
      const charterCampaignId = selectedShowData.Charter_Campaign_ID;

      // Resolve selected tour guide's CRM_Organization from sales reps data (for Charter org logic)
      const getRepName = (rep: any) =>
        rep?.name ??
        rep?.Name ??
        rep?.sales_rep_name ??
        rep?.Sales_Rep_Name ??
        rep?.full_name ??
        rep?.Full_Name ??
        rep?.first_name ??
        rep?.First_Name ??
        rep?.last_name ??
        rep?.Last_Name ??
        rep?.display_name ??
        rep?.Display_Name ??
        rep?.user_name ??
        rep?.User_Name ??
        rep?.employee_name ??
        rep?.Employee_Name ??
        "";
      const selectedRep =
        formData.tourGivenBy && salesRepsData?.length
          ? salesRepsData.find(
              (rep: any) => getRepName(rep) === formData.tourGivenBy
            )
          : null;
      const tourGivenByCrmOrganization = selectedRep
        ? selectedRep.CRM_Organization ?? selectedRep.crm_organization ?? null
        : null;
      const tourGivenByMobile = selectedRep
        ? (
            selectedRep.Phone_Number ??
            selectedRep.phone_number ??
            null
          )?.replace(/^\+/, "") ?? null
        : null;

      const formDataWithBoatShow = {
        ...formDataWithCountryCode,
        boatShowName: boatShowName,
        sunreefYachtCampaignId: sunreefYachtCampaignId,
        charterCampaignId: charterCampaignId,
        timezone: selectedTimezone,
        countryName: selectedCountry,
        defaultSunreefUserId: selectedShowData.Default_Sunreef_User,
        defaultCharterUserId: selectedShowData.Default_Charter_User_ID,
        tourGivenByCrmOrganization: tourGivenByCrmOrganization ?? undefined,
        tourGivenByMobile: tourGivenByMobile ?? undefined,
        boatShowPort: selectedPort || undefined,
        ...(enrichedData
          ? {
              profileSummary: enrichedData.profileSummary,
              aiLeadScore: enrichedData.aiLeadScore,
              wealthCategory: enrichedData.wealthCategory,
            }
          : {}),
      };

      const response = await yachtAPI.submitForm(
        formDataWithBoatShow,
        selectedShowData.Creator_App_Name
      );

      // Show detailed success message
      let successMessage = "✅ Form submitted successfully!\n\n";

      // Check CRM results (even if crmResult is null, we might have lead info from error response)
      let hasLeadInfo = false;

      // Check if there are duplicate leads (from success or error response)
      if (
        response.crm?.duplicateLeadInfo &&
        response.crm.duplicateLeadInfo.length > 0
      ) {
        successMessage += `📊 Zoho CRM: Duplicate leads detected\n`;
        response.crm.duplicateLeadInfo.forEach((duplicate: any) => {
          successMessage += `   📧 ${duplicate.email}: Existing Lead ID ${duplicate.existingLeadId}\n`;
        });
        hasLeadInfo = true;
      }

      // Check if there are new leads (from success or error response)
      if (response.crm?.newLeadInfo && response.crm.newLeadInfo.length > 0) {
        successMessage += `📊 Zoho CRM: New leads created\n`;
        response.crm.newLeadInfo.forEach((newLead: any) => {
          successMessage += `   📧 ${newLead.email}: New Lead ID ${newLead.newLeadId}\n`;
        });
        hasLeadInfo = true;
      }

      // Check if the contact already existed in CRM (no lead is created in
      // that flow — the contact is updated and the meeting linked to it)
      if (
        response.crm?.existingContactInfo &&
        response.crm.existingContactInfo.length > 0
      ) {
        successMessage += `📊 Zoho CRM: Existing contacts detected
`;
        response.crm.existingContactInfo.forEach((contact: any) => {
          successMessage += `   📧 ${contact.email}: Existing Contact ID ${contact.existingContactId}
`;
        });
        hasLeadInfo = true;
      }

      // If no specific lead info but records exist, show general success
      if (
        !hasLeadInfo &&
        response.crm?.records &&
        response.crm.records.length > 0
      ) {
        successMessage += `📊 Zoho CRM: Lead created successfully\n`;
        const record = response.crm.records[0];
        if (record.id) {
          successMessage += `   Lead ID: ${record.id}\n`;
        }
        hasLeadInfo = true;
      }

      // Consider CRM success when we have meetings linked to contact (existing contact flow)
      const hasMeetingLinkedToContact = response.crm?.meetings?.some(
        (m: any) => m.contactId
      );
      if (!hasLeadInfo && hasMeetingLinkedToContact) {
        successMessage += `📊 Zoho CRM: Existing contact updated; meeting linked to contact\n`;
        hasLeadInfo = true;
      }
      if (!hasLeadInfo) {
        successMessage += `❌ Zoho CRM: Submission failed\n`;
      }

      // 🎯 Show meeting creation results (from success or error response)
      if (response.crm?.meetings && response.crm.meetings.length > 0) {
        successMessage += `\n📅 Meeting Creation Results:\n`;
        const tourGivenByDisplay = formData.tourGivenBy || "—";
        successMessage += `   👤 Tour Given By / Meeting assigned to: ${tourGivenByDisplay}\n`;
        response.crm.meetings.forEach((meetingResult: any) => {
          if (meetingResult.meeting.success) {
            successMessage += `   ✅ Meeting created successfully\n`;
            successMessage += `   📋 Meeting ID: ${meetingResult.meeting.meetingId}\n`;
            if (meetingResult.leadId) {
              successMessage += `   🔗 Linked to Lead ID: ${
                meetingResult.leadId
              } (${meetingResult.leadSource || "new"})\n`;
            } else if (meetingResult.contactId) {
              successMessage += `   🔗 Linked to Contact ID: ${meetingResult.contactId}\n`;
            } else {
              successMessage += `   📝 Standalone meeting (no lead or contact linked)\n`;
            }
          } else {
            successMessage += `   ❌ Meeting creation failed\n`;
            successMessage += `   📝 Reason: ${meetingResult.meeting.message}\n`;
          }
        });
      }

      // 🎯 Show OTHER org (Charter) results
      if (
        response.crm?.otherOrgResults &&
        response.crm.otherOrgResults.length > 0
      ) {
        successMessage += `\n🏢 Charter Org Results:\n`;
        response.crm.otherOrgResults.forEach((otherResult: any) => {
          if (otherResult.success) {
            if (otherResult.leadSource === "existing") {
              successMessage += `   ✅ Charter: Existing ${
                otherResult.existingModule || "record"
              } found\n`;
            } else {
              successMessage += `   ✅ Charter: Lead created successfully\n`;
            }
            successMessage += otherResult.assignedToDefaultCharterUser
              ? `   👤 Assigned to: Default Charter User\n`
              : `   👤 Tour Guide: ${otherResult.tourGuide}\n`;
            successMessage += `   📋 ${
              otherResult.existingModule || "Lead"
            } ID: ${otherResult.leadId}\n`;
            if (otherResult.meetingId) {
              successMessage += `   📅 Meeting ID: ${otherResult.meetingId}\n`;
            } else if (otherResult.message) {
              successMessage += `   📝 ${otherResult.message}\n`;
            }
          } else {
            successMessage += `   ❌ Charter: ${otherResult.message}\n`;
          }
        });
      }

      if (response.creator) {
        successMessage += `📝 Zoho Creator: Record created successfully\n`;
        if (
          response.creator.creator_response &&
          response.creator.creator_response.result
        ) {
          const result = response.creator.creator_response.result;
          if (
            Array.isArray(result) &&
            result.length > 0 &&
            result[0].data &&
            result[0].data.ID
          ) {
            successMessage += `   Creator ID: ${result[0].data.ID}\n`;
          }
        }
      } else {
        successMessage += `❌ Zoho Creator: Submission failed\n`;
      }

      successMessage += `\n⏰ Submitted at: ${new Date(
        response.timestamp
      ).toLocaleString()}\n\nOur team will contact you soon!`;

      // Set summary data and show slide
      const summaryDataToSave = {
        success: true,
        message: successMessage,
        response: response,
        timestamp: new Date(response.timestamp).toLocaleString(),
      };
      // Set summary data and show it
      setSummaryData(summaryDataToSave);
      setShowSummary(true);

      // Simple scroll to top for iPad
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);

      // Save summary data to localStorage for persistence after refresh
      localStorage.setItem(
        "sunreef-form-summary",
        JSON.stringify(summaryDataToSave)
      );

      // Reset form after showing summary
      setTimeout(() => {
        handleFormReset();
      }, 100);
    } catch (error: any) {
      console.error("❌ Error submitting form:", error);

      let errorMessage = "❌ Failed to submit form.\n\n";

      if (error.response) {
        // API error response
        if (error.response.status === 400) {
          errorMessage += "Please check your form data and try again.";
        } else if (error.response.status === 500) {
          errorMessage += "Server error. Please try again later.";
        } else {
          errorMessage += `Error: ${error.response.status} - ${error.response.statusText}`;
        }
      } else if (error.request) {
        // Network error
        errorMessage += "Network error. Please check your internet connection.";
      } else {
        // Other error
        errorMessage += "An unexpected error occurred. Please try again.";
      }

      // Set error summary data and show slide
      setSummaryData({
        success: false,
        message: errorMessage,
        error: error,
        timestamp: new Date().toLocaleString(),
      });
      setShowSummary(true);
    } finally {
      // Restore button state
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    }
  };

  // Handle form reset
  const handleFormReset = () => {
    setFormData({
      firstName: "",
      lastName: "",
      mobile: "",
      email: "",
      city: "",
      state: "",
      country: "",
      postal: "",
      currentOwner: null,
      interestedCharter: null,
      isBroker: false,
      boatType: "",
      modelInterested: "",
      budgetAllocation: "",
      purchaseTimeline: "",
      commercial: true,
      marketing: true,
      notes: "",
      hereFor: "", // Reset new field
      tourGivenBy: "",
      fromDate: getDefaultDate(), // Reset to event start date, then work based on today's date
      fromTime: "08:00", // Reset to default time
      toTime: "08:30", // Auto-set to 30 minutes after fromTime
    });

    // Reset country code to null (no default selection)
    setSelectedCountryCode(null);

    // Clear country search term
    setCountrySearchTerm("");

    // Reset calendar selected date to default
    setCurrentSelectedDate(new Date(getDefaultDate()));

    // Clear email search result when form is reset
    setEmailSearchResult(null);
  };

  // Handle country code selection
  const selectCountryCode = (country: Country) => {
    setSelectedCountryCode(country);
    setIsCountryDropdownOpen(false);
    // Automatically set the country in the form data when country code is selected
    setFormData((prev) => ({
      ...prev,
      country: country.code,
    }));
  };

  // Filter countries based on search and sort by country name
  const filteredCountries = countries
    .filter((country) => {
      // Normalize both search term and country name for better matching
      const normalizeString = (str: string) =>
        str
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
          .replace(/[^a-z0-9\s]/g, "") // Remove special characters
          .trim();

      const normalizedSearchTerm = normalizeString(countrySearchTerm);
      const normalizedCountryName = normalizeString(country.name);

      return (
        normalizedCountryName.includes(normalizedSearchTerm) ||
        country.dialCode.includes(countrySearchTerm) ||
        country.code.toLowerCase().includes(countrySearchTerm.toLowerCase())
      );
    })
    .sort((a, b) => {
      // Sort by country name alphabetically (A to Z)
      return a.name.localeCompare(b.name, "en", {
        sensitivity: "base",
        numeric: true,
      });
    });

  // Debug: Log countries count
  // Dev logs removed for production cleanliness

  // Debug: Log first 10 filtered countries to verify sorting
  if (filteredCountries.length > 0) {
    // dev log removed
  }

  // Debug: Log last 10 filtered countries to verify sorting
  if (filteredCountries.length > 0) {
    // dev log removed
  }

  // Calendar date selection
  const selectDate = (date: string) => {
    setCurrentSelectedDate(new Date(date));
    // No need to load events since users remain the same for all dates
    // loadEventsForDate(date)
  };

  // Load team members from Creator API
  const loadTeamMembersFromCreator = async () => {
    try {
      // Get the selected show data to extract Creator_App_Name
      const selectedShowData = getSelectedShowData();
      if (!selectedShowData || !selectedShowData.Creator_App_Name) {
        console.error("No selected show data or Creator_App_Name found");
        return;
      }

      const response = await yachtAPI.getSalesRepresentatives(
        selectedShowData.Creator_App_Name
      );

      if (response.success && response.data) {
        // Debug: Check first record structure
        if (response.data.length > 0) {
          // debug removed
        }

        // Extract team member names from Creator response
        const teamMemberNames = response.data
          .map((rep: any) => {
            // Try multiple possible field names for the name
            const name =
              rep.name ||
              rep.Name ||
              rep.sales_rep_name ||
              rep.Sales_Rep_Name ||
              rep.full_name ||
              rep.Full_Name ||
              rep.first_name ||
              rep.First_Name ||
              rep.last_name ||
              rep.Last_Name ||
              rep.display_name ||
              rep.Display_Name ||
              rep.user_name ||
              rep.User_Name ||
              rep.employee_name ||
              rep.Employee_Name;

            return name;
          })
          .filter((name: any) => {
            return name && typeof name === "string" && name.trim().length > 0;
          })
          .sort();

        setInspectors(teamMemberNames);
        setTourGivenByOptions(teamMemberNames);
        setSalesRepsData(response.data); // Store the full data for location-based coloring
      } else {
        // No fallback - let the form work with empty data
      }
    } catch (error) {
      console.error(
        "❌ Error loading sales representatives from Creator:",
        error
      );
      // No fallback - let the form work with empty data
    }
  };

  // Load real events from API
  const loadRealEvents = async () => {
    try {
      // Load events for today's date
      const todayString = new Date().toISOString().split("T")[0];
      const response = await yachtAPI.getEvents(todayString);

      if (response.success && response.data) {
        // Process events data into calendar format
        const processedEvents = new Map<string, CalendarEvent[]>();
        const selectedDateIso =
          currentSelectedDate && !isNaN(currentSelectedDate.getTime())
            ? currentSelectedDate.toISOString().split("T")[0]
            : todayString;

        response.data.forEach((event: any) => {
          // Validate event data before processing
          if (!event || typeof event !== "object") {
            return;
          }

          // Validate inspector name - use name from CRM API
          const inspectorName = event.First_Name;
          if (!inspectorName || typeof inspectorName !== "string") {
            return;
          }

          // Parse start and end dates from CRM API
          const startDate = new Date(event.first_day);
          const endDate = new Date(event.Sixth_day);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return;
          }

          // Convert to selected country timezone for display
          const countryStartTime = selectedTimezone
            ? startDate.toLocaleString("en-US", {
                timeZone: selectedTimezone,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : startDate.toLocaleString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });

          // Get client name or use "Available" if no client
          const clientName = event.client?.name || "Available";
          const clientId = event.client?.id || null;

          // Create calendar event (include date/timeRange for downstream filters)
          const calendarEvent: CalendarEvent = {
            inspector: inspectorName, // Team member name
            time: countryStartTime,
            title: clientName,
            type: clientId ? "booked" : "available", // "booked" if has client, "available" if not
            clientId: clientId,
            location: clientName, // Use client name as location
            org: event.org, // Track which org this event is from
            date: selectedDateIso, // used by inspectorHasEvents/getEventCount filters
            timeRange: `${countryStartTime}-${add30Minutes(countryStartTime)}`,
          };

          // Create unique key for this time slot and inspector
          const eventKey = `${inspectorName}-${countryStartTime}`;

          if (!processedEvents.has(eventKey)) {
            processedEvents.set(eventKey, []);
          }
          processedEvents.get(eventKey)!.push(calendarEvent);
        });

        // Only update when we have events to display; avoids flicker on intermittent empty responses
        if (processedEvents.size > 0) {
          setCalendarEvents(processedEvents);
        }
      } else {
        // No fallback - let the form work with empty data
      }
    } catch (error) {
      console.error("❌ Error loading events:", error);
      // No fallback - let the form work with empty data
    }
  };

  // Check if inspector has events for the selected date (case-insensitive + partial matching)
  const inspectorHasEvents = (inspector: string) => {
    const insp = String(inspector || "");
    return Array.from(calendarEvents.entries()).some(([key, arr]) => {
      const lastDashIndex = key.lastIndexOf("-");
      const keyInspector = key.substring(0, lastDashIndex);

      if (nameMatches(insp, keyInspector)) {
        // Check if there are events for the selected date
        return arr.some((event) => {
          if (!event.date) return false; // Skip events without date
          return event.date === currentSelectedDate.toISOString().split("T")[0];
        });
      }
      return false;
    });
  };

  // Get event count for inspector for the selected date only
  const getEventCount = (inspector: string) => {
    const insp = String(inspector || "");

    // Collect all unique meetings for this inspector on the selected date
    const uniqueMeetings = new Set();

    Array.from(calendarEvents.entries()).forEach(([key, arr]) => {
      const lastDashIndex = key.lastIndexOf("-");
      const keyInspector = key.substring(0, lastDashIndex);

      if (nameMatches(insp, keyInspector)) {
        // Filter events by the selected date
        const eventsForSelectedDate = arr.filter((event) => {
          if (!event.date) return false; // Skip events without date
          return event.date === currentSelectedDate.toISOString().split("T")[0];
        });

        // Add each unique meeting to the set
        eventsForSelectedDate.forEach((event) => {
          // Use a combination of title, timeRange, and date to identify unique meetings
          const meetingId = `${event.title}-${event.timeRange}-${event.date}`;
          uniqueMeetings.add(meetingId);
        });
      }
    });

    return uniqueMeetings.size;
  };

  // Get location for a specific date from sales representative data
  const getLocationForDate = (
    inspector: string,
    date: string
  ): string | null => {
    // Find the sales representative by name in the full data
    const salesRep = salesRepsData.find((rep) =>
      nameMatches(rep.First_Name, inspector)
    );
    if (!salesRep) return null;

    // Get the date in DD-MMM-YYYY format (e.g., "09-Sep-2025").
    // Using manual formatting so we always get "Sep" (not "Sept") to match API.
    const dateObj = new Date(date);
    const monthShort = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][dateObj.getMonth()];
    const formattedDate = `${String(dateObj.getDate()).padStart(
      2,
      "0"
    )}-${monthShort}-${dateObj.getFullYear()}`;

    // Check which day field matches the selected date
    if (salesRep.first_day === formattedDate) {
      return salesRep.First_Day_Location || null;
    } else if (salesRep.Second_Day === formattedDate) {
      return salesRep.Second_Day_Location || null;
    } else if (salesRep.Third_day === formattedDate) {
      return salesRep.Third_Day_Location || null;
    } else if (salesRep.Fourth_Day === formattedDate) {
      return salesRep.Fourth_day_Location || null;
    } else if (salesRep.Fifth_day === formattedDate) {
      return salesRep.Fifth_Day_Location || null;
    } else if (salesRep.Sixth_day === formattedDate) {
      return salesRep.Sixth_day_Location || null;
    }

    return null;
  };

  // Get color based on location
  const getLocationColor = (location: string): string => {
    switch (location?.toUpperCase()) {
      case "PORT CANTO":
        return "#0e1cec"; // Blue
      case "VIEUX PORT":
        return "#28a745"; // Green
      default:
        return "#6f42c1"; // Purple for no location
    }
  };

  // Calendar visibility is now controlled by the slider
  // Removed toggleCalendar function as it's no longer needed

  // Handle slider interaction
  const handleSliderChange = (newPosition: number) => {
    setSliderPosition(newPosition);

    // Show calendar when slider is moved past 50%
    if (newPosition > 50) {
      setIsCalendarVisible(true);
    } else {
      setIsCalendarVisible(false);
    }
  };

  // Handle slider drag
  const handleSliderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const track = e.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();

    let clientX: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = e.clientX;
    }

    const position = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );
    handleSliderChange(position);
  };

  // Handle slider release
  const handleSliderRelease = () => {
    setIsDragging(false);
    // Snap to either 0 or 100 based on current position
    if (sliderPosition > 50) {
      setSliderPosition(100);
      setIsCalendarVisible(true);
    } else {
      setSliderPosition(0);
      setIsCalendarVisible(false);
      // Reset scroll flag when calendar is closed so it can scroll again when reopened
      setHasScrolledToCurrentTime(false);
    }
  };

  // Simple and reliable auto-scroll to current time
  const autoScrollToCurrentTime = () => {
    try {
      if (!selectedTimezone) {
        return; // Skip if no timezone is available
      }

      const now = new Date();
      // Convert to selected country timezone
      const countryTime = new Date(
        now.toLocaleString("en-US", { timeZone: selectedTimezone })
      );
      const currentHour = countryTime.getHours();
      const currentMinute = countryTime.getMinutes();

      // Find the current or closest past time slot
      let targetTimeSlot = "08:00"; // Default fallback

      for (let i = 0; i < timeSlots.length; i++) {
        const [hour, minute] = timeSlots[i].split(":").map(Number);

        // If this time slot is before or equal to current time, it's a candidate
        if (
          hour < currentHour ||
          (hour === currentHour && minute <= currentMinute)
        ) {
          targetTimeSlot = timeSlots[i];
        } else {
          // If we've passed the current time, break and use the last valid slot
          break;
        }
      }

      // Try multiple selectors to find the scrollable container
      let calendarContainer =
        document.querySelector(".calendar-grid-container") ||
        document.querySelector(".calendar-container") ||
        document.querySelector('[class*="calendar"]');

      if (!calendarContainer) {
        // If still not found, try to find any scrollable container
        const scrollableElements = document.querySelectorAll("*");
        for (let element of scrollableElements) {
          if (element.scrollWidth > element.clientWidth) {
            calendarContainer = element;
            break;
          }
        }
      }

      if (calendarContainer) {
        // Calculate scroll position to center the current time slot
        const timeSlotIndex = timeSlots.indexOf(targetTimeSlot);
        if (timeSlotIndex !== -1) {
          const timeSlotWidth = 120; // Approximate width of each time slot
          const inspectorColumnWidth = 180; // Width of inspector column
          const containerWidth = calendarContainer.clientWidth;

          // Simple calculation to center the time slot
          const scrollPosition =
            timeSlotIndex * timeSlotWidth -
            containerWidth / 2 +
            inspectorColumnWidth;

          // Use both scrollTo and scrollLeft for better compatibility
          if (calendarContainer.scrollTo) {
            calendarContainer.scrollTo({
              left: Math.max(0, scrollPosition),
              behavior: "smooth",
            });
          } else {
            calendarContainer.scrollLeft = Math.max(0, scrollPosition);
          }
        }
      } else {
        // Alternative: scroll the window to the current time element
        const currentTimeElement =
          document.querySelector(`[data-current="true"]`) ||
          document.querySelector(`[data-time="${targetTimeSlot}"]`) ||
          document.querySelector(`[class*="${targetTimeSlot}"]`);
        if (currentTimeElement) {
          currentTimeElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        } else {
        }
      }
    } catch (error) {
      console.error("Error in autoScrollToCurrentTime:", error);
    }
  };

  // Store scroll position to prevent resetting when data refreshes
  const [hasScrolledToCurrentTime, setHasScrolledToCurrentTime] =
    useState(false);

  // Popup state for event details
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [showEventPopup, setShowEventPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Get current country time slot for highlighting
  const getCurrentTimeSlot = (): string => {
    if (!selectedTimezone) {
      return timeSlots[0]; // Return first time slot if no timezone
    }

    const now = new Date();
    // Convert to selected country timezone
    const countryTime = new Date(
      now.toLocaleString("en-US", { timeZone: selectedTimezone })
    );
    const currentHour = countryTime.getHours();
    const currentMinute = countryTime.getMinutes();

    // Find the current or closest past time slot
    let closestSlot = timeSlots[0]; // Default to first time slot

    for (let i = 0; i < timeSlots.length; i++) {
      const [hour, minute] = timeSlots[i].split(":").map(Number);

      // If this time slot is before or equal to current time, it's a candidate
      if (
        hour < currentHour ||
        (hour === currentHour && minute <= currentMinute)
      ) {
        closestSlot = timeSlots[i];
      } else {
        // If we've passed the current time, break and return the last valid slot
        break;
      }
    }

    return closestSlot;
  };

  // Simple auto-scroll when calendar opens
  useEffect(() => {
    if (isCalendarVisible) {
      // Wait a bit for calendar to render, then scroll
      const timer = setTimeout(() => {
        autoScrollToCurrentTime();
      }, 1000); // Increased delay to ensure calendar is fully rendered

      return () => clearTimeout(timer);
    }
  }, [isCalendarVisible]);

  // Also try to scroll when data loads
  useEffect(() => {
    if (isCalendarVisible && inspectors.length > 0) {
      const timer = setTimeout(() => {
        autoScrollToCurrentTime();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [inspectors, isCalendarVisible]);

  // Close popup when pressing Escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showEventPopup) {
        setShowEventPopup(false);
        setSelectedEvent(null);
        setPopupPosition(null);
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [showEventPopup]);

  // Preserve scroll position when data refreshes (after initial scroll)
  useEffect(() => {
    if (isCalendarVisible && hasScrolledToCurrentTime) {
      // Calendar is open and has already scrolled, preserve position
      const calendarContainer = document.querySelector(
        ".calendar-grid-container"
      );
      if (calendarContainer) {
        // Store current scroll position
        const currentScrollLeft = calendarContainer.scrollLeft;

        // Use a small timeout to ensure DOM is updated
        setTimeout(() => {
          if (calendarContainer) {
            calendarContainer.scrollLeft = currentScrollLeft;
          }
        }, 50);
      }
    }
  }, [inspectors, calendarEvents, isCalendarVisible, hasScrolledToCurrentTime]);

  // Handle event click for both desktop and mobile
  const handleEventClick = (
    event: CalendarEvent,
    _inspector: string,
    _timeSlot: string,
    clickEvent: React.MouseEvent | React.TouchEvent
  ) => {
    // Get click position for positioning the popup near the clicked meeting
    const rect = (
      clickEvent.currentTarget as HTMLElement
    ).getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const clickY = rect.top + rect.height / 2;

    setPopupPosition({ x: clickX, y: clickY });
    setSelectedEvent(event);
    setShowEventPopup(true);
  };

  // Handle touch events more reliably
  const handleTouchEvent = (
    event: CalendarEvent,
    _inspector: string,
    _timeSlot: string,
    touchEvent: React.TouchEvent
  ) => {
    // Prevent default touch behavior
    touchEvent.preventDefault();
    touchEvent.stopPropagation();

    // Get touch position
    const rect = (
      touchEvent.currentTarget as HTMLElement
    ).getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const clickY = rect.top + rect.height / 2;

    setPopupPosition({ x: clickX, y: clickY });
    setSelectedEvent(event);
    setShowEventPopup(true);
  };

  // Get events for specific inspector and time on current selected date
  const getEventsForSlot = (inspector: string, timeSlot: string) => {
    // Try exact match first
    let eventKey = `${inspector}-${timeSlot}`;
    let events = calendarEvents.get(eventKey) || [];

    // If no exact match, try case-insensitive and partial matching
    if (events.length === 0) {
      const matchingKeys = Array.from(calendarEvents.keys()).filter((key) => {
        const lastDashIndex = key.lastIndexOf("-");
        const actualInspector = key.substring(0, lastDashIndex);
        const actualTime = key.substring(lastDashIndex + 1);
        return (
          actualTime === timeSlot && nameMatches(inspector, actualInspector)
        );
      });

      // Collect events from all matching keys
      events = matchingKeys.reduce((allEvents, key) => {
        return allEvents.concat(calendarEvents.get(key) || []);
      }, [] as CalendarEvent[]);
    }

    // Filter events by current selected date
    return events.filter((event) => {
      if (!event.date) return true; // Show events without date (sample events)
      return event.date === currentSelectedDate.toISOString().split("T")[0];
    });
  };

  return (
    <div className="container">
      {/* Form Section */}
      <div className="form-section">
        {/* Logo Section - Above Banner */}
        <div className="logo-section">
          <img
            src="https://res.cloudinary.com/vy23hatk/image/upload/v1787650219/Sunreef_Black.png"
            alt="Sunreef Yachts Logo"
            className="logo"
          />
        </div>

        {/* Banner Section */}
        <div className="form-title-wrapper">
          <div className="form-title">
            <h1>{eventHeading || "Monaco Yacht Show 2025"}</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} onReset={handleFormReset}>
          {/* Personal Details Section */}
          <div className="section-title">Personal Details</div>

          <div className="form-row">
            <div className="form-group half-width">
              <label htmlFor="firstName">
                First Name <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group half-width">
              <label htmlFor="lastName">
                Last Name <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group half-width">
              <label htmlFor="mobile">
                Mobile <span style={{ color: "red" }}>*</span>
              </label>
              <div className="mobile-input">
                <div className="country-code-dropdown">
                  <button
                    type="button"
                    className="country-code-btn"
                    onClick={() =>
                      setIsCountryDropdownOpen(!isCountryDropdownOpen)
                    }
                  >
                    <span className="flag">
                      {selectedCountryCode?.flag || "🌍"}
                    </span>
                    <span className="code">
                      {selectedCountryCode?.dialCode || "Select"}
                    </span>
                    <span className="arrow">▼</span>
                    {!selectedCountryCode && (
                      <span style={{ color: "red", marginLeft: "4px" }}>*</span>
                    )}
                  </button>

                  {isCountryDropdownOpen && (
                    <div className="country-dropdown-menu show">
                      <div className="country-search">
                        <div className="search-icon">🔍</div>
                        <input
                          type="text"
                          placeholder="Search countries..."
                          className="search-input"
                          value={countrySearchTerm}
                          onChange={(e) => setCountrySearchTerm(e.target.value)}
                        />
                        {countrySearchTerm && (
                          <button
                            type="button"
                            className="clear-search-btn"
                            onClick={() => setCountrySearchTerm("")}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="country-list">
                        {/* Debug: Show count of visible countries */}
                        <div
                          style={{
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "#666",
                            borderBottom: "1px solid #eee",
                            backgroundColor: "#f8f9fa",
                          }}
                        >
                          {/* Showing {filteredCountries.length} of {countries.length} countries  */}
                        </div>
                        {filteredCountries.map((country) => (
                          <div
                            key={country.code}
                            className="country-option"
                            onClick={() => selectCountryCode(country)}
                          >
                            <span className="flag">{country.flag}</span>
                            <span className="name">{country.name}</span>
                            <span className="code">{country.dialCode}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  id="mobile"
                  name="mobile"
                  placeholder="81234 56789"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
            <div className="form-group half-width">
              <label htmlFor="email">
                Email <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                onBlur={(e) => {
                  const email = e.target.value.trim();
                  const valid = isValidEmail(email);
                  setEmailInvalid(!valid);
                  if (email && valid) {
                    handleEmailSearch(email);
                    handleEnrichment({ email });
                  }
                }}
                required
              />
              {/* Invalid address — blocks the submit */}
              {emailInvalid && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#c0392b",
                    marginTop: "4px",
                    padding: "8px",
                    backgroundColor: "#ffe6e6",
                    border: "1px solid #ffcccc",
                    borderRadius: "4px",
                  }}
                >
                  Invalid email
                </div>
              )}
              {/* Email validation message */}
              {(isSearchingEmail || isEnriching) && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginTop: "4px",
                    fontStyle: "italic",
                  }}
                >
                  {isSearchingEmail && isEnriching
                    ? "Searching & Enriching…"
                    : isSearchingEmail
                    ? "Searching…"
                    : "Enriching…"}
                </div>
              )}
              {/* Client segment badge — only for new leads with no CRM record */}
              {enrichedData &&
                enrichedData.wealthCategory &&
                (!emailSearchResult || !emailSearchResult.exists) &&
                (() => {
                  const meta = wealthCategoryMeta(enrichedData.wealthCategory);
                  return (
                    <div style={{ marginTop: "6px" }}>
                      <span
                        className={`enrichment-badge enrichment-badge--${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                  );
                })()}
              {emailSearchResult && emailSearchResult.message && (
                <div
                  style={{
                    fontSize: "12px",
                    color: emailSearchResult.exists ? "#0e1cec" : "#1a7a3c",
                    marginTop: "4px",
                    padding: "8px",
                    backgroundColor: emailSearchResult.exists
                      ? "#f0f4ff"
                      : "#f0fff4",
                    borderRadius: "4px",
                    border: `1px solid ${
                      emailSearchResult.exists ? "#d1e0ff" : "#b2dfcc"
                    }`,
                    whiteSpace: "pre-line",
                  }}
                >
                  {emailSearchResult.message}

                  {/* Display related events if available */}
                  {emailSearchResult.events &&
                    emailSearchResult.events.length > 0 && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px",
                          backgroundColor: "#ffffff",
                          borderRadius: "4px",
                          border: "1px solid #e0e0e0",
                        }}
                      >
                        {emailSearchResult.events.map((event, index) => {
                          const formattedStartDateTime =
                            formatDateTimeToCountryTimezone(
                              event.startDateTime
                            );
                          const formattedEndDateTime =
                            formatDateTimeToCountryTimezone(event.endDateTime);
                          const hostName = event.host?.name || "Unknown";

                          return (
                            <div
                              key={event.id || index}
                              style={{
                                marginBottom: "4px",
                                padding: "4px",
                                backgroundColor: "#f9f9f9",
                                borderRadius: "3px",
                                fontSize: "11px",
                                color: "#666",
                                fontWeight: "bold",
                              }}
                            >
                              👤 Host: {hostName} | 🕒 Date:{" "}
                              {formattedStartDateTime.date} | ⏰ Time:{" "}
                              {formattedStartDateTime.time} -{" "}
                              {formattedEndDateTime.time} ({selectedCountry})
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {/* Display events error if there was an error fetching events */}
                  {emailSearchResult.eventsError && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "8px",
                        backgroundColor: "#ffe6e6",
                        borderRadius: "4px",
                        border: "1px solid #ff9999",
                        fontSize: "11px",
                        color: "#cc0000",
                        fontWeight: "bold",
                      }}
                    >
                      ❌ Error fetching events: {emailSearchResult.eventsError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="currentDateTime">Current Date & Time</label>
              <input
                type="text"
                id="currentDateTime"
                name="currentDateTime"
                value={currentDateTime}
                readOnly
              />
            </div>
          </div>

          {/* Address Section */}
          <div className="section-title">Address Information</div>

          <div className="form-row">
            <div className="form-group half-width">
              <label htmlFor="city">City / District</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group half-width">
              <label htmlFor="state">State / Province</label>
              <input
                type="text"
                id="state"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group half-width">
              <label htmlFor="country">Country</label>
              <select
                id="country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
              >
                <option value="">-Select-</option>
                {countries
                  .sort((a, b) =>
                    a.name.localeCompare(b.name, "en", {
                      sensitivity: "base",
                      numeric: true,
                    })
                  )
                  .map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group half-width">
              <label htmlFor="postal">
                Postal Code{" "}
                {isPostalCodeRequired() && (
                  <span style={{ color: "red" }}>*</span>
                )}
              </label>
              <input
                type="text"
                id="postal"
                name="postal"
                value={formData.postal}
                onChange={handleInputChange}
                required={isPostalCodeRequired()}
              />
            </div>
          </div>

          {/* Yacht Information Section */}
          <div className="section-title">Yacht Information</div>

          {/* New Dropdown: Are you here for */}
          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="hereFor">
                Please tell us the purpose of your visit{" "}
                <span style={{ color: "red" }}>*</span>
              </label>
              <select
                id="hereFor"
                name="hereFor"
                value={formData.hereFor}
                onChange={handleInputChange}
                required
              >
                {hereForOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group third-width">
              <label>Current Boat Owner</label>
              <div className="radio-group">
                <CustomRadioButton
                  name="currentOwner"
                  value="true"
                  label="Yes"
                  checked={formData.currentOwner === true}
                  onChange={handleRadioChange}
                />
                <CustomRadioButton
                  name="currentOwner"
                  value="false"
                  label="No"
                  checked={formData.currentOwner === false}
                  onChange={handleRadioChange}
                />
              </div>
            </div>

            <div className="form-group third-width">
              <label>Interested in Charter</label>
              <div className="radio-group">
                <div style={{ display: "flex", gap: "20px" }}>
                  <CustomRadioButton
                    name="interestedCharter"
                    value="true"
                    label="Yes"
                    checked={formData.interestedCharter === true}
                    onChange={handleRadioChange}
                  />
                  <CustomRadioButton
                    name="interestedCharter"
                    value="false"
                    label="No"
                    checked={formData.interestedCharter === false}
                    onChange={handleRadioChange}
                  />
                </div>
              </div>
            </div>

            <div className="form-group third-width">
              <label>Are you a Broker</label>
              <div className="radio-group">
                <CustomRadioButton
                  name="isBroker"
                  value="true"
                  label="Yes"
                  checked={formData.isBroker === true}
                  onChange={handleRadioChange}
                />
                <CustomRadioButton
                  name="isBroker"
                  value="false"
                  label="No"
                  checked={formData.isBroker === false}
                  onChange={handleRadioChange}
                />
              </div>
            </div>
          </div>

          {/* Conditional Boat Type Field */}
          {formData.currentOwner === true && (
            <div
              className="form-row"
              style={{ display: "flex", animation: "slideDown 0.3s ease-out" }}
            >
              <div className="form-group full-width">
                <label htmlFor="boatType">
                  Boat Type (Power/Sail, Brand, Model, Length)
                </label>
                <input
                  type="text"
                  id="boatType"
                  name="boatType"
                  value={formData.boatType}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          )}

          {/* Model Interested Field - Always Visible */}
          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="modelInterested">Model Interested In</label>
              <select
                id="modelInterested"
                name="modelInterested"
                value={formData.modelInterested}
                onChange={handleInputChange}
              >
                <option value="">-Select-</option>
                {availableModels.length > 0 ? (
                  availableModels.map((model, index) => (
                    <option key={index} value={model}>
                      {model}
                    </option>
                  ))
                ) : (
                  // Fallback to static options if no models are available
                  <>
                    <option value="SUNREEF 50">Sunreef 50</option>
                    <option value="Sunreef 60 NEXT">Sunreef 60 NEXT</option>
                    <option value="Sunreef 70 NEXT">Sunreef 70 NEXT</option>
                    <option value="Sunreef 80 NEXT">Sunreef 80 NEXT</option>
                    <option value="Sunreef 100 next">Sunreef 100 NEXT</option>
                    <option value="sunreef 100 infinity">
                      Sunreef 100 Infinity
                    </option>
                    <option value="60 sunreef power next">
                      60 Sunreef Power NEXT
                    </option>
                    <option value="70 sunreef power next">
                      70 Sunreef Power NEXT
                    </option>
                    <option value="80 sunreef power next">
                      80 Sunreef Power NEXT
                    </option>
                    <option value="100 sunreef power next">
                      100 Sunreef Power NEXT
                    </option>
                    <option value="44 Ultima">Ultima 44</option>
                    <option value="55 Ultima">Ultima 55</option>
                    <option value="66 Ultima">Ultima 66</option>
                    <option value="77 Ultima">Ultima 77</option>
                    <option value="88 Ultima">Ultima 88</option>
                    <option value="111 Ultima">Ultima 111</option>
                    <option value="Sunreef 35 M">Sunreef 35M</option>
                    <option value="SUNREEF 43M">Sunreef 43M</option>
                    <option value="49M SUNREEF POWER">49M Sunreef Power</option>
                    <option value="210 SUNREEF POWER TRIMARAN">
                      210 Sunreef Power Trimaran
                    </option>
                    <option value="40M SUNREEF EXPLORER">
                      40M Sunreef Explorer
                    </option>
                    <option value="40M SUNREEF EXPLORER ECO">
                      40M Sunreef Explorer Eco
                    </option>
                    <option value="50m sunreef explorer">
                      50M Sunreef Explorer
                    </option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Budget Allocation and Purchase Timeline Fields - Side by Side */}
          <div className="form-row form-row--align-end">
            <div className="form-group half-width">
              <label htmlFor="budgetAllocation">
                How much are you willing to allocate to this asset
              </label>
              <select
                id="budgetAllocation"
                name="budgetAllocation"
                value={formData.budgetAllocation}
                onChange={handleInputChange}
              >
                <option value="">-None-</option>
                <option value="Below 2 Mn">Below 2 Mn</option>
                <option value="2 Mn to 5 Mn">2 Mn to 5 Mn</option>
                <option value="5 Mn to 8 Mn">5 Mn to 8 Mn</option>
                <option value="8 Mn to 10 Mn">8 Mn to 10 Mn</option>
                <option value="10 Mn to 15 Mn">10 Mn to 15 Mn</option>
                <option value="I am not sure yet">I am not sure yet</option>
              </select>
            </div>
            <div className="form-group half-width">
              <label htmlFor="purchaseTimeline">
                How soon are you planning to buy a Yacht
              </label>
              <select
                id="purchaseTimeline"
                name="purchaseTimeline"
                value={formData.purchaseTimeline}
                onChange={handleInputChange}
              >
                <option value="">-Select-</option>
                <option value="Within 3 months">Within 3 months</option>
                <option value="Within 6 months">Within 6 months</option>
                <option value="Within a yearr">Within a year</option>
                <option value="More than a Year">More than a Year</option>
              </select>
            </div>
          </div>

          {/* Additional Information Section */}
          <div className="section-title">Additional Information</div>

          <div className="checkbox-group">
            <div className="checkbox-option">
              <input
                type="checkbox"
                id="commercial"
                name="commercial"
                checked={formData.commercial}
                onChange={handleInputChange}
              />
              <label htmlFor="commercial" className="checkbox-text">
                I agree for receiving commercial information concerning products
                and services of SUNREEF VENTURE S.A. and their partners,
                including receiving the newsletter and other business
                information
              </label>
            </div>
            <div className="checkbox-option">
              <input
                type="checkbox"
                id="marketing"
                name="marketing"
                checked={formData.marketing}
                onChange={handleInputChange}
              />
              <label htmlFor="marketing" className="checkbox-text">
                I agree for the marketing purposes of products and services of
                SUNREEF VENTURE S.A. and their partners, including receiving the
                newsletter and other business information
              </label>
            </div>
          </div>

          {/* Hostess Section */}
          <div className="hostess-section">
            <div className="hostess-header">
              <span>
                THIS SECTION IS TO BE COMPLETED BY THE SUNREEF YACHTS TEAM ONLY
              </span>
            </div>
            <div className="hostess-content">
              <div className="form-row" style={{ flexWrap: "nowrap" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="tourGivenBy">Tour Given By</label>
                  <select
                    id="tourGivenBy"
                    name="tourGivenBy"
                    value={formData.tourGivenBy || ""}
                    onChange={handleInputChange}
                  >
                    <option value="">-Select-</option>
                    {tourGivenByOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="fromDate">From Date</label>
                  <input
                    type="text"
                    id="fromDate"
                    name="fromDate"
                    value={
                      formData.fromDate
                        ? formatDateForDisplay(formData.fromDate)
                        : ""
                    }
                    readOnly
                    ref={fromDateInputRef}
                    style={{
                      width: "100%",
                      backgroundColor: "#ffffff",
                      color: "#1a202c",
                      cursor: "pointer",
                    }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="fromTime">From Time</label>
                  <select
                    id="fromTime"
                    name="fromTime"
                    value={formData.fromTime || ""}
                    onChange={handleInputChange}
                    style={{ width: "100%" }}
                  >
                    <option value="">Time</option>
                    {timeSlots.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="toTime">To Time</label>
                  <select
                    id="toTime"
                    name="toTime"
                    value={formData.toTime || ""}
                    onChange={handleInputChange}
                    style={{ width: "100%" }}
                  >
                    <option value="">Time</option>
                    {timeSlots.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {portOptions.length > 0 && (
                  <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                    <label htmlFor="selectedPort">Stand Location</label>
                    <select
                      id="selectedPort"
                      value={selectedPort}
                      onChange={(e) => {
                        setSelectedPort(e.target.value);
                        try {
                          sessionStorage.setItem(
                            "sunreef-selected-port",
                            e.target.value
                          );
                        } catch {}
                      }}
                    >
                      <option value="">-Select-</option>
                      {portOptions.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Date validation error message */}
              {dateValidationError && (
                <div className="form-row">
                  <div className="form-group full-width">
                    <div
                      style={{
                        color: "red",
                        fontSize: "14px",
                        marginTop: "5px",
                        padding: "8px",
                        backgroundColor: "#ffe6e6",
                        border: "1px solid #ffcccc",
                        borderRadius: "4px",
                      }}
                    >
                      {dateValidationError}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group full-width">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    name="notes"
                    placeholder="Additional information or special requirements..."
                    value={formData.notes}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="btn-group">
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                position: "relative",
                minWidth: "120px",
              }}
            >
              <span className="submit-text">Submit</span>
              <span className="submit-loading" style={{ display: "none" }}>
                <span className="loading-spinner">⏳</span> Submitting...
              </span>
            </button>
            <button type="reset" className="btn btn-secondary">
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Calendar Section */}
      <div
        className="calendar-section"
        // ref={(el) => {
        //   // Calendar section reference
        // }}
      >
        <div className="calendar-header">
          <div
            className="calendar-title-section"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              gap: "20px",
            }}
          >
            {/* Left side - Teams Calendar title */}
            <div style={{ flex: "0 0 auto" }}>
              {isCalendarVisible && (
                <h2
                  style={{
                    margin: 0,
                    color: "#2c3e50",
                    fontSize: "20px",
                    minWidth: "150px",
                  }}
                >
                  Teams Calendar
                </h2>
              )}
            </div>

            {/* Center - Slider and Legend */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "30px",
                flex: "1",
                justifyContent: "space-between",
              }}
            >
              {/* Calendar Slider */}
              <div className="calendar-slider-container">
                <div
                  className={`calendar-slider-track ${
                    isDragging ? "dragging" : ""
                  }`}
                  onMouseDown={handleSliderDrag}
                  onMouseMove={(e) => {
                    if (e.buttons === 1) handleSliderDrag(e);
                  }}
                  onMouseUp={handleSliderRelease}
                  onMouseLeave={handleSliderRelease}
                  onTouchStart={handleSliderDrag}
                  onTouchMove={handleSliderDrag}
                  onTouchEnd={handleSliderRelease}
                >
                  <div
                    className="calendar-slider-thumb"
                    style={{
                      left: `${Math.max(
                        8,
                        Math.min(190, (sliderPosition / 100) * 236)
                      )}px`,
                    }}
                  >
                    <span className="slider-icon">
                      {sliderPosition > 50 ? "←" : "→"}
                    </span>
                  </div>
                  <div
                    className="slider-progress"
                    style={{ width: `${sliderPosition}%` }}
                  ></div>
                  <div className="slider-text">
                    {sliderPosition > 50
                      ? "Calendar Visible!"
                      : "Slide to show calendar"}
                  </div>
                </div>
              </div>

              {/* Location Legend - Hidden as requested */}
              {/* {isCalendarVisible && (
                <div 
                  className="location-legend"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '20px',
                    alignItems: 'center',
                    flexWrap: 'nowrap',
                    minWidth: '0',
                    width: '100%',
                    justifyContent: 'center',
                    // Force horizontal layout with !important equivalent
                    transform: 'none',
                    writingMode: 'horizontal-tb',
                    direction: 'ltr',
                    // Additional force horizontal
                    position: 'relative',
                    overflow: 'visible',
                    height: 'auto',
                    minHeight: 'auto'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'row',
                    alignItems: 'center', 
                    gap: '8px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    minWidth: 'fit-content',
                    // Additional force horizontal
                    transform: 'none',
                    writingMode: 'horizontal-tb',
                    position: 'relative',
                    overflow: 'visible'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#0e1cec',
                      flexShrink: 0,
                      position: 'relative'
                    }}></div>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#666',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                      // Force text to stay horizontal
                      writingMode: 'horizontal-tb',
                      textOrientation: 'mixed',
                      position: 'relative',
                      display: 'inline-block',
                      width: 'auto'
                    }}>PORT CANTO</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'row',
                    alignItems: 'center', 
                    gap: '8px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    minWidth: 'fit-content',
                    // Additional force horizontal
                    transform: 'none',
                    writingMode: 'horizontal-tb',
                    position: 'relative',
                    overflow: 'visible'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#28a745',
                      flexShrink: 0,
                      position: 'relative'
                    }}></div>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#666',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                      // Force text to stay horizontal
                      writingMode: 'horizontal-tb',
                      textOrientation: 'mixed',
                      position: 'relative',
                      display: 'inline-block',
                      width: 'auto'
                    }}>VIEUX PORT</span>
                  </div>
                </div>
              )} */}
            </div>

            {/* Right side - Empty space for balance */}
            <div style={{ flex: "0 0 auto", minWidth: "150px" }}></div>
          </div>
        </div>

        <div
          className={`calendar-container ${
            isCalendarVisible ? "visible" : "hidden"
          }`}
          style={{
            display: isCalendarVisible ? "flex" : "none",
            flexDirection: "column",
            gap: "20px",
          }}
          // ref={(el) => {
          //   // Calendar container reference
          // }}
        >
          {/* Date Navigation Buttons */}
          <div className="date-navigation">
            <div className="date-buttons">
              {festivalDates.map((festivalDate) => {
                const isActive =
                  !isNaN(currentSelectedDate.getTime()) &&
                  currentSelectedDate.toISOString().split("T")[0] ===
                    festivalDate.date;

                return (
                  <button
                    key={festivalDate.date}
                    className={`date-btn ${isActive ? "active" : ""}`}
                    data-date={festivalDate.date}
                    onClick={() => selectDate(festivalDate.date)}
                  >
                    {festivalDate.day}
                  </button>
                );
              })}
            </div>
            <div className="current-date-display" id="currentDateDisplay">
              {(() => {
                const date = new Date(currentSelectedDate);
                if (isNaN(date.getTime())) {
                  return "Invalid Date";
                }
                return date.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                });
              })()}
            </div>
          </div>

          {/* Calendar Grid Container */}
          <div className="calendar-grid-container">
            <div className="scroll-indicator" id="scrollIndicator">
              Scroll right for more times →
            </div>

            <div className="calendar-grid" id="calendarGrid">
              {/* Calendar Header Row */}
              <div className="calendar-header-row">
                <div className="calendar-header-cell inspector-header">
                  Team Member
                </div>
                {timeSlots.map((timeSlot) => (
                  <div
                    key={timeSlot}
                    className="calendar-header-cell"
                    data-time={timeSlot}
                    data-current={
                      timeSlot === getCurrentTimeSlot() ? "true" : "false"
                    }
                    style={{
                      backgroundColor:
                        timeSlot === getCurrentTimeSlot()
                          ? "#90EE90"
                          : undefined,
                      border:
                        timeSlot === getCurrentTimeSlot()
                          ? "3px solid #32CD32"
                          : undefined,
                      fontWeight:
                        timeSlot === getCurrentTimeSlot() ? "700" : undefined,
                      boxShadow:
                        timeSlot === getCurrentTimeSlot()
                          ? "0 0 10px rgba(50, 205, 50, 0.5)"
                          : undefined,
                      transform:
                        timeSlot === getCurrentTimeSlot()
                          ? "scale(1.05)"
                          : undefined,
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div className="time-split-container">
                      <span className="time-left">{timeSlot}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Inspector Rows - Fixed to show inspectors properly */}
              {inspectors.length > 0 ? (
                inspectors.map((inspector, index) => (
                  <div
                    key={`${inspector}-${index}`}
                    className="calendar-time-row"
                  >
                    {/* Inspector Profile Cell */}
                    <div className="time-slot-cell inspector-cell">
                      <div className="inspector-profile">
                        <div
                          className={`profile-picture ${
                            inspectorHasEvents(inspector) ? "has-events" : ""
                          }`}
                          style={(() => {
                            const location = getLocationForDate(
                              inspector,
                              currentSelectedDate.toISOString().split("T")[0]
                            );
                            if (location) {
                              const color = getLocationColor(location);
                              return {
                                background: color,
                                borderColor: color,
                                color: "white",
                              } as React.CSSProperties;
                            }
                            // No location → let CSS handle the default purple gradient
                            return {};
                          })()}
                        >
                          <span className="inspector-initial">
                            {getInspectorInitial(inspector)}
                          </span>
                          {inspectorHasEvents(inspector) &&
                            getEventCount(inspector) > 0 && (
                              <div className="event-count">
                                {getEventCount(inspector)}
                              </div>
                            )}
                        </div>
                        <div className="inspector-name">{inspector}</div>
                      </div>
                    </div>

                    {/* Time Slot Data Cells */}
                    {timeSlots.map((timeSlot) => {
                      const events = getEventsForSlot(inspector, timeSlot);
                      return (
                        <div
                          key={`${inspector}-${timeSlot}`}
                          className={`calendar-data-cell ${
                            events.some(
                              (event) =>
                                event.totalSlots &&
                                event.totalSlots > 1 &&
                                !event.isLast
                            )
                              ? "has-connected-event"
                              : ""
                          }`}
                          data-inspector={inspector}
                          data-time={timeSlot}
                        >
                          {/* Events */}
                          {events.map((event, eventIndex) => {
                            const isConnected =
                              event.totalSlots && event.totalSlots > 1;
                            const coverage = event.coverage || 100;

                            return (
                              <div
                                key={eventIndex}
                                className={`event-block ${event.type || ""} ${
                                  event.isFirst ? "event-first" : ""
                                } ${event.isLast ? "event-last" : ""} ${
                                  isConnected ? "event-connected" : ""
                                }`}
                                style={{
                                  width: `${coverage}%`,
                                  marginRight:
                                    coverage < 100 ? `${100 - coverage}%` : "0",
                                  height: "20px",
                                  minHeight: "20px",
                                  cursor: "pointer",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  MozUserSelect: "none",
                                  msUserSelect: "none",
                                  touchAction: "manipulation",
                                  /* Mobile touch improvements */
                                  WebkitTapHighlightColor: "transparent",
                                  WebkitTouchCallout: "none",
                                }}
                                title={`${event.title} - ${inspector} - ${
                                  event.timeRange || timeSlot
                                } (${coverage}% coverage)`}
                                onClick={(e) => {
                                  // Only handle click if touch wasn't already handled
                                  if (!touchHandled) {
                                    e.stopPropagation();
                                    handleEventClick(
                                      event,
                                      inspector,
                                      timeSlot,
                                      e
                                    );
                                  }
                                }}
                                onTouchStart={(e) => {
                                  handleTouchEvent(
                                    event,
                                    inspector,
                                    timeSlot,
                                    e
                                  );
                                }}
                                onTouchEnd={() => {
                                  // Mark touch as handled to prevent click event
                                  setTouchHandled(true);
                                  setTimeout(() => {
                                    setTouchHandled(false);
                                  }, 100);
                                }}
                              >
                                {event.isFirst && (
                                  <span className="event-text">
                                    {event.timeRange || timeSlot} •{" "}
                                    {event.client?.name || "N/A"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                // Loading state or empty state
                <div className="calendar-empty-state">
                  <div className="empty-message">
                    {inspectors.length === 0
                      ? "Loading inspectors..."
                      : "No inspectors available"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Event Details Popup */}
      {showEventPopup && selectedEvent && (
        <div
          className="event-popup-overlay"
          onClick={() => {
            setShowEventPopup(false);
            setPopupPosition(null);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            zIndex: 1000,
            padding: "20px",
            /* Mobile improvements */
            touchAction: "manipulation",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="event-popup-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
              position: "relative",
              // Position near click location for all screen sizes
              ...(popupPosition
                ? {
                    position: "absolute",
                    top: Math.max(
                      20,
                      Math.min(popupPosition.y - 100, window.innerHeight - 300)
                    ),
                    left: Math.max(
                      20,
                      Math.min(popupPosition.x - 200, window.innerWidth - 420)
                    ),
                    transform: "none",
                  }
                : {}),
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                setShowEventPopup(false);
                setPopupPosition(null);
              }}
              style={{
                position: "absolute",
                top: "12px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#666",
                padding: "4px",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>

            {/* Event Details */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  margin: "0 0 16px 0",
                  color: "#333",
                  fontSize: "20px",
                  fontWeight: "600",
                }}
              >
                Scheduled Meeting
              </h3>
              {selectedEvent.client?.name && (
                <h4
                  style={{
                    margin: "0 0 12px 0",
                    color: "#0e1cec",
                    fontSize: "16px",
                    fontWeight: "500",
                  }}
                >
                  with {selectedEvent.client.name}
                </h4>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  fontSize: "14px",
                  color: "#666",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ fontWeight: "500" }}>Representative:</span>
                  <span>{selectedEvent.inspector}</span>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ fontWeight: "500" }}>Time:</span>
                  <span>{selectedEvent.timeRange || selectedEvent.time}</span>
                </div>

                {selectedEvent.client?.name && (
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ fontWeight: "500" }}>Client:</span>
                    <span style={{ color: "#0e1cec", fontWeight: "500" }}>
                      {selectedEvent.client.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowEventPopup(false);
                  setPopupPosition(null);
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Slide */}
      {showSummary && (
        <div className="summary-slide-overlay" onClick={closeSummaryAndRefresh}>
          <div
            ref={summaryRef}
            className="summary-slide"
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            style={{ outline: "none" }}
          >
            <div className="summary-header">
              <h3>{summaryData?.success ? "✅ Success!" : "❌ Error"}</h3>
              <button
                className="summary-close-btn"
                onClick={closeSummaryAndRefresh}
              >
                ×
              </button>
            </div>

            <div className="summary-content">
              {summaryData?.success ? (
                <div className="success-summary">
                  {/* Display the detailed success message */}
                  <div className="summary-section">
                    <h4>📊 Submission Details</h4>
                    <div className="summary-item">
                      <span className="label">Status:</span>
                      <span className="value success">
                        ✅ Successfully Submitted
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Time:</span>
                      <span className="value">{summaryData.timestamp}</span>
                    </div>
                  </div>

                  {/* Display detailed message with Lead IDs */}
                  {summaryData.message && (
                    <div className="summary-section">
                      <h4>📋 Detailed Summary</h4>
                      <div className="detailed-message">
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            fontFamily: "inherit",
                            fontSize: "14px",
                            lineHeight: "1.4",
                            margin: 0,
                            padding: "10px",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "4px",
                            border: "1px solid #e9ecef",
                          }}
                        >
                          {summaryData.message}
                        </pre>
                      </div>
                    </div>
                  )}

                  {summaryData.response?.crm?.records && (
                    <div className="summary-section">
                      <h4>🎯 CRM Lead</h4>
                      {summaryData.response.crm.records.map(
                        (record: any, index: number) => (
                          <div key={index} className="summary-item">
                            <span className="label">Lead ID:</span>
                            <span className="value">{record.id || "N/A"}</span>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {summaryData.response?.crm?.meetings && (
                    <div className="summary-section">
                      <h4>📅 Meeting Created</h4>
                      {summaryData.response.crm.meetings.map(
                        (meeting: any, index: number) => (
                          <div key={index} className="meeting-summary">
                            {meeting.meeting.success ? (
                              <>
                                <div className="summary-item">
                                  <span className="label">Meeting ID:</span>
                                  <span className="value">
                                    {meeting.meeting.meetingId}
                                  </span>
                                </div>
                                <div className="summary-item">
                                  <span className="label">Linked to Lead:</span>
                                  <span className="value">
                                    {meeting.leadId || "Standalone"}
                                  </span>
                                </div>
                                <div className="summary-item">
                                  <span className="label">Source:</span>
                                  <span className="value">
                                    {meeting.leadSource || "new"}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="summary-item error">
                                <span className="label">Error:</span>
                                <span className="value">
                                  {meeting.meeting.message}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {summaryData.response?.creator && (
                    <div className="summary-section">
                      <h4>📝 Creator Record</h4>
                      <div className="summary-item">
                        <span className="label">Status:</span>
                        <span className="value success">✅ Created</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="error-summary">
                  <div className="summary-section">
                    <h4>❌ Submission Failed</h4>
                    <div className="error-message">{summaryData?.message}</div>
                    <div className="summary-item">
                      <span className="label">Time:</span>
                      <span className="value">{summaryData?.timestamp}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YachtCharterForm;

export interface CalendarEvent {
  title: string;
  type: string;
  inspector: string;
  time: string;
  date?: string;
  timeRange?: string;
  coverage?: number;
  isFirst?: boolean;
  isLast?: boolean;
  totalSlots?: number;
  clientId?: string | null;
  slotIndex?: number;
  org?: string;
  location?: string;
  client?: {
    id: string | null;
    name: string;
    module: string;
    source: string;
  };
}

export interface ApiEvent {
  org: string;
  name: string;
  start_date: string;
  end_date: string;
}
