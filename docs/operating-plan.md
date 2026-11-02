# The operating plan

The **Edubotics Global Operational Calendar, June 2026 – May 2027** lives in the app. Each sheet maps to a page:

| Sheet | In the app |
|---|---|
| Annual Plan (month, focus, activities, targets, lead, planning meeting, review) | **Plan → Annual plan**: one card per month, editable by managers and admins. Number targets (leads, meetings, conversions, workshop and internship students, college projects, school proposals, cash invoiced and received) become the month's scorecard. |
| How Each Month Runs | The rhythm on **Plan → Monthly work plan** and in **Calendar**: planning meeting on the first working day, task updates every Friday by 6 pm, the Green / Amber / Red review every Saturday at 10 am, the commission statement by the 5th, month results on the last two working days. |
| Monthly Work Plan (area, activity, owner, deadline, target, actual, status, colour) | **Plan → Monthly work plan**: tasks with an owner (told in their Inbox), the Friday update form, the Saturday review with a suggested colour, and a written recovery plan for Red. Unfinished tasks can be carried into the next month. |
| Commission (5% to the sales executive who closed the sale) | **CRM → Sales commission**: worked out from payments on invoices raised from a deal the person owns, without GST. A manager prepares the month's statement and an admin approves it. |
| Internships, teacher training and bootcamps | **Operations → Workshops and internships**, with a type on each programme. |

## Where the numbers come from

Scorecard numbers count themselves: new leads and meetings/visits marked done in CRM, deals marked won, people registered on workshops (by type), student projects started in Projects, quotes sent to schools, invoices issued (less credit notes) and money received (invoice payments with TDS, plus workshop fees). A target of type "Custom" is filled in by hand.

## Colours

Green is 90% or more of where the task should be by now (the target spread evenly from the 1st to the deadline), Amber 70–89% or one missed deadline, Red below 70% or overdue. The reviewer can always pick another colour.

## Loading it

`npm run db:seed` (run on every Docker start) loads the twelve months into a database with no plan yet. Managers can also press **Load the operating calendar** on the Annual plan page. Months that already exist are never overwritten.

Saturdays hold the weekly review, so set **Admin → Settings → Weekly offs** to Sunday only if Saturday is a working day.
