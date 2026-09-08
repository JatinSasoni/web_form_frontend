# Sunreef Yacht Registration Form

A React TypeScript application for yacht registration and charter services.

## Features

- **Yacht Registration Form**: Complete form with personal details, address information, and yacht preferences
- **Country Code Selector**: Interactive dropdown with search functionality for international phone numbers
- **Calendar Component**: Date selection interface for scheduling
- **Responsive Design**: Mobile-friendly layout with modern UI components
- **Real-time Updates**: Current date and time display

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
src/
├── components/
│   └── YachtCharterForm.tsx    # Main form component
├── App.tsx                      # Root component
├── main.tsx                     # Application entry point
└── index.css                    # Global styles
```

## Form Sections

1. **Personal Details**: Name, mobile, email, current date/time
2. **Address Information**: Complete address fields
3. **Yacht Information**: Boat ownership, charter interest, model preferences
4. **Additional Information**: Marketing preferences and notes
5. **Calendar**: Date selection interface

## Technologies Used

- React 18
- TypeScript
- Vite
- CSS3 with custom styling
- Modern ES6+ JavaScript features

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development

The application is built with modern React patterns and TypeScript for type safety. The form includes comprehensive validation and a responsive design that works across all device sizes.
