# Frontend UI & Micro-Animation Prompts Reference

This document catalogs structured, non-destructive UI prompts specifically crafted for this Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 stack. Each prompt is designed so that any AI assistant strictly modifies frontend visual code and never alters backend endpoints, JWT tokens, authentication services, or business logic.

---

## 1. Input & Form Enhancements

### 🔹 Floating Label Animation
> "In this Next.js/React/TypeScript component using Tailwind v4, add a floating label animation to this input — the label should sit as placeholder text inside the input and smoothly slide up + shrink above it on focus/typing. Use Tailwind transition classes or CSS. Do not modify the form's `onSubmit` handler, validation, or any API calls in `lib/api.ts`."

### 🔹 Input Focus Glow & Border Transition
> "Add a smooth Tailwind transition for `border-color` and `box-shadow` on focus/blur for this input component. Purely styling — do not touch state management, validation logic, or the fetch/axios calls that submit this form."

### 🔹 Shake on Error
> "Add a short shake animation (~300ms, Tailwind + keyframes `animate-shake`) triggered when the existing error state for this field/form is truthy. Only toggle a class based on the existing error state from React state — do not change how errors are set or where they come from (e.g., don't touch the 401/refresh logic in `lib/api.ts`)."

### 🔹 Password Strength Meter
> "Add a password strength meter below the password input in this React component that animates width/color as the user types, based on a simple client-side check (length, character variety). Purely visual/local state — do not send this to any backend service or touch `auth-service`."

### 🔹 Show/Hide Password Toggle
> "Add an eye icon (`lucide-react` is available) inside the password input that toggles input type between `'password'` and `'text'` with a smooth icon transition. Purely local component state — no changes to the login/register submit logic."

---

## 2. Buttons & Actions

### 🔹 Button-to-Spinner Morph
> "When the login/register button is clicked, animate it shrinking into a spinner while the existing async submit function is pending, then animate back on resolve/reject. Wrap the animation around the existing `handleSubmit` function from `lib/api.ts` — do not change what it does, its request payload, or its cookie/token handling."

### 🔹 Success Checkmark Pulse
> "After a successful login/register (based on the existing success state returned from the `auth-service` call), animate the button turning green with a checkmark and a small pulse before the existing redirect happens. Purely visual on top of the existing success condition — do not modify the JWT/cookie flow."

### 🔹 Ripple / Press Effect
> "Add a ripple or active scale effect (`active:scale-[0.98]`) on click for buttons across the app using Tailwind/CSS. Purely visual — do not modify any `onClick` handlers' actual logic, only wrap the visual effect around them."

### 🔹 Gradient Radial Glow (GradientButton)
> "Apply the `@property` radial gradient transition with border sweep hover effect to high-intent CTA buttons across the application, keeping standard buttons clean for administrative/sign-in flows."

---

## 3. Page & Component Transitions

### 🔹 Card Scale-In Entrance
> "Add a subtle scale + fade-in entrance animation (200–300ms, `animate-scale-in`) to the card component on mount. Purely a CSS/Framer Motion entrance animation — no logic changes to the component."

### 🔹 Slide & Fade View Transitions
> "Add a smooth fade + slide transition when switching between Login, Sign Up, and Onboarding views in the Next.js app router. Use Framer Motion's `AnimatePresence` or CSS transitions — do not change routing logic, `middleware.ts`, or JWT verification."

---

## 4. Feedback & Reliability Indicators

### 🔹 Slide-Down Inline Errors
> "Animate validation error messages sliding down + fading in below their input when the existing error state is set, and sliding up on clear. Trigger purely off existing form state — do not change validation rules."

### 🔹 Toast Notification Slide-In
> "Add a toast component that slides in from the corner and auto-dismisses after a few seconds, for success/error messages. Trigger it from the existing success/error states returned by `lib/api.ts` calls — do not change what those calls do or their error handling logic."

### 🔹 Skeleton Loading Shimmer
> "Add a skeleton loading placeholder with shimmer animation for dashboard telemetry and scan results while data is loading, shown based on existing `isLoading` state from backend fetch calls. Do not change the fetch logic itself."

---

## 5. Navigation & Layout Micro-Interactions

### 🔹 Hamburger-to-X Morph
> "Animate the mobile nav hamburger icon morphing into an X on open/close, using the existing toggle state. No changes to nav/menu logic."

### 🔹 Underline Slide on Nav Hover
> "Add an animated underline sliding in under nav links on hover using a Tailwind pseudo-element (`.nav-link-hover`). Purely visual, no changes to Next.js Link routing."

### 🔹 Hover Lift on Cards & Items
> "Add a subtle hover lift (`translateY(-2px)`) + scale effect with smooth transition on dashboard cards / repo list items via `.hover-lift`."
