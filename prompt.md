# Role and Context
You are an expert Full-stack Engineer specializing in AI/ML web applications, Next.js, NestJS, and MediaPipe. We are pivoting the `EyeMotionDetect` project from a precise mouse-replacement tool to a "Gaze-controlled 4-choice Multiple Choice Question (MCQ) System". 

Because precise pixel-level eye tracking via standard webcams is hindered by micro-saccades, we are adopting a region-based classification approach combined with Dwell-Time selection. Additionally, we need to implement an Admin Dashboard to manage test users and their calibration data.

# Objective
Refactor the current monorepo (Next.js frontend + NestJS backend + MediaPipe/MLP) to support a 4-quadrant UI where users can answer A/B/C/D questions purely using their eye gaze. Build a secure Admin Dashboard for user and data management. Update the project documentation to reflect the proper local development workflow.

# Key Requirements & Architecture Updates

## 1. Admin Dashboard & User Management
- **Default Admin Account**: Ensure the NestJS backend automatically seeds an admin user with username `admin` and password `admin` on application startup if it does not already exist.
- **Backend APIs & RBAC (`apps/api`)**:
  - Implement basic Role-Based Access Control (RBAC) to differentiate between standard users and the admin.
  - Create admin-only protected endpoints to:
    1. Fetch a list of all registered users.
    2. Create new user accounts (standard users cannot sign up themselves; the admin creates accounts for them).
    3. Check the calibration status of each user (a boolean flag or joined data indicating if their specific MLP weights are stored in the database).
- **Frontend Admin UI (`apps/web/app/admin`)**:
  - Create a protected `/admin` route accessible only to the admin account.
  - Build a dashboard containing:
    - A table listing all users and a clear visual indicator of whether they have completed calibration (data added) or not.
    - A simple form or modal to create/register new test users.

## 2. Frontend UI/UX (Next.js - `apps/web`)
- **Gaze-based MCQ Interface**: Create a new page displaying a question in the center-top and 4 very large answer buttons (A, B, C, D) positioned in the 4 corners/quadrants of the screen.
- **Deadzone Implementation**: Ensure there is significant spacing (deadzones) between the 4 answer boxes. If the gaze falls in the deadzone, no action is taken.
- **Dwell-Time Selection Engine**: 
  - Replace blink-to-click logic with a "Dwell-Time" mechanism.
  - If the user's estimated gaze (X,Y from the MLP model) stays within the bounding box of an answer for **1.5 to 2 seconds**, trigger a click event.
  - Implement a visual indicator (e.g., a filling circular progress bar) on the hovered button to provide real-time visual feedback.

## 3. Gaze Tracking & Calibration Logic (`apps/web/lib/gaze`)
- **Refactor `CalibrationPanel.tsx`**: Modify the calibration to be a quick 4-point calibration (centers of the 4 answer boxes). 
- **Mapping Logic**: Update the logic so the MLP model predictions are mapped to the 4 quadrants or the deadzone.

## 4. Backend Integration (NestJS - `apps/api`)
- Ensure the personalized weights for the `mlp-model.ts` are saved and loaded correctly via the existing `WeightsController` and `WeightsService`. 
- When a standard user logs in, if they have no weights in the database, force them to complete the 4-point calibration before accessing the MCQ system.

## 5. Development Workflow & Documentation Updates (`README.md`)
- Update the `README.md` to explicitly state that the developer MUST start the existing PostgreSQL container before running the backend. Add the following command to the run instructions:
  `docker start eyemotiondetect`
- Add a "Database Management" section advising developers to use lightweight tools like VS Code extensions (e.g., Database Client, SQLTools) or DBeaver to inspect the database, explicitly noting that pulling a heavy pgAdmin 4 image is unnecessary.

# Instructions for Execution
1. Provide the backend code updates (NestJS) for seeding the `admin`/`admin` account and creating the admin-only endpoints (list users, create user, check calibration status).
2. Provide the frontend Next.js code for the `/admin` dashboard page.
3. Provide the updated `README.md` reflecting the new Docker and database tool instructions.
4. Provide the updated code for the `GazeProvider.tsx` to handle region detection and dwell-time state.
5. Provide a new React component `MCQBoard.tsx` that utilizes the gaze context to render the 4 choices and the dwell-time progress visual.