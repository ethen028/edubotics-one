# Product requirements

## Overview

| | |
| --- | --- |
| Product | Orbit |
| For | Edubotics Global, Kochi (Edappally), Kerala: robotics, AI and STEM programmes for schools (grades 1 to 8), college and professional workshops, internships, teacher training, robotics and IoT kits |
| What it is | One internal app that runs the company's day-to-day work: selling, delivering, people and money |
| Status | Built and in use. Production is one office computer (Docker) used over the office Wi-Fi; a protected Vercel copy holds demo data only |

## Problem

A 10-person company was running sales, school delivery, HR, payroll and billing across spreadsheets, WhatsApp and separate tools. Nobody could see what was owed, who was where, or what was late without asking someone. Off-the-shelf ERPs (ERPNext, Odoo) were considered and rejected in favour of an app built around how Edubotics actually works.

## Goal

Every staff member opens one app each morning and sees what they need to do; the owner sees the whole business (sales, money in and out, dues, delivery, people) without asking for a report.

## Users

| Role | Who | Needs |
| --- | --- | --- |
| Owner | The founder (an admin with the owner mark) | Money, dues, payroll cost, sales and the whole picture on one dashboard |
| Admin | Office/operations lead | Logins, settings, billing, purchases, stock, payroll, approvals, backups |
| HR | HR executive | People records, attendance, leave, hiring, onboarding, training, reviews, exits. No salaries |
| Manager | Team leads | Approve their team's leave, timesheets and expenses; run projects and delivery; see billing |
| Employee | Trainers, sales, engineers | Check in, apply for leave, log work, tick checklists, log school sessions, claim expenses, see payslips |

Trainers work at schools, often on phones. Every page has to work at 375 px.

## What it does

Full list with detail: [README.md](../README.md). In short:

- **Selling**: leads, institutions, contacts, deal pipeline, follow-ups, quotes, sales commission (5%).
- **Delivering**: school programmes with weekly timetables and session logs, workshops and certificates, internships, projects with an eight-step flow, tasks, timesheets, daily checklists, annual and monthly operating plan, calendar.
- **People**: HR records, attendance (Present, ID, OD, Mis-punch, Absent, Leave), leave (15 casual + 3 sick), onboarding, documents, training, assets, recruitment and careers page, HR letters and certificates, performance reviews, exits, payroll and payslips, expense claims, recognition wall.
- **Money**: GST invoices, credit notes, payments with TDS, payment reminders, purchase orders, vendor bills, payables, accounts summary for the accountant.
- **Running the company**: approvals inbox, inventory, helpdesk, notice board, Teamwork (messages, channels, files, meetings), four role dashboards, emails from the company account, backups, activity log, sign-in safety.

## Rules the owner has decided

These are business decisions, not code choices. Don't change them without the owner.

- Fully custom app; the repo is the source of truth.
- Leave: 15 casual + 3 sick days a year, plus unpaid LOP. No earned leave. Kerala government holidays.
- Salary: Basic + HRA + special allowance. LOP per day = gross / 30.
- Statutory deductions (PF, ESI, Kerala professional tax, TDS, gratuity) are built but **switched off** until the accountant confirms them.
- GST: SAC 999293 at 18% by default; CGST + SGST inside Kerala, IGST otherwise. Document numbers like `EBG/26-27/001`, restarting each April, with no gaps.
- HR letters: probation 3 months, notice 30 days from either side during and after probation (defaults in Settings, changeable per letter). HR letters have their own signatory, separate from workshop certificates. Letters that show pay are admin-only. The letter wording is a starting point the owner has not had checked by a lawyer yet.
- Owner is an admin with an owner mark, not a fifth role. Only the owner sees the owner dashboard.
- Recognition has no points, prizes or anything worth money.
- Staff messages are readable only by the people in the conversation; admins cannot read them. Channels are open to all staff by design. Files folders can be for chosen people, but admins can open every folder.
- Teamwork can be limited to logins on the company email domain (Admin > Settings > Teamwork), like a company Teams workspace. Calls run in Google Meet, Zoom or Teams; Orbit stores the link, it does not host video.
- Automatic payment reminders are off until switched on; at most one per school per 7 days, three per invoice.
- The look: one purple accent on a pale lavender page ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).

## Not built, on purpose or not yet

- Phone app: an Expo Android draft exists (PR #37) but is parked; it needs an HTTPS address.
- Public internet access: the office copy is Wi-Fi only, so trainers at schools can't reach it. Google sign-in is built but off for the same reason.
- Form 16 (it comes from the income tax TRACES portal; Orbit gives an annual salary statement instead), termination letters, digital or e-signing of letters.
- File storage outside the database, encrypted backups, a public API.
- Message attachments, notifications and typing indicators.

## How we know it works

- Staff use it every working day instead of spreadsheets for attendance, leave, sessions, invoices and payroll.
- The owner can answer "what are we owed and by whom" from the dashboard alone.
- Payroll and GST figures match the accountant's numbers.
- No role can open a page its job doesn't need (`npm run test:roles`).
