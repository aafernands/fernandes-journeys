"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Share2, Pencil, Ellipsis, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRow } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nativeShare } from "@/lib/native-share";
import { TripDestinationHero } from "./TripDestinationHero";
import {
  journalNotesForDestination,
  type JournalNote,
  type JournalPlace,
} from "@/lib/trip-journal";
import { OutboundLink } from "@/components/outbound/OutboundLink";
import { NavIcon } from "@/components/icons/NavIcon";
import { BottomTabItemBody } from "@/components/ui/BottomTabBar";
import type { TripSaveMode } from "@/components/trip-planner/useTripSync";
import {
  dateSummary,
  hotelLaneHref,
  isFlightLanePartner,
  partnerLaneHref,
  travelerSummary,
  type PlannerState,
  type TripPlannerConfig,
  type TripPlannerPartner,
} from "@/lib/trip-planner-model";
import {
  cleanConfirmation,
  cleanDayIndex,
  cleanItemDate,
  cleanTime,
  createTripItem,
  extractBookingPaste,
  mentionedTripDay,
  isTripItemUrl,
  itemsForLane,
  itemTypeForPartner,
  compareScheduledItems,
  itemScheduleTime,
  planATripLoginHref,
  TRIPS_ACCOUNT_UNAVAILABLE,
  FREE_TRIP_LIMIT_MESSAGE,
  sharePlanHref,
  scheduledDayIndex,
  tripDays,
  TRIP_ITEM_STATUSES,
  TRIP_STATUS_LABEL,
  type TripDay,
  type TripItem,
  type TripItemStatus,
  type TripItemType,
} from "@/lib/trip-record";
import type { StoredPlan } from "@/lib/trip-planner-storage";
import { flightItemLinkLabel } from "@/lib/flights";
import { stayItemLinkLabel } from "@/lib/stays";
import { FLIGHT_LANE_HASH } from "@/lib/flights-itinerary";
import { STAY_LANE_HASH } from "@/lib/stays-itinerary";
import { TRIP_SECTION_BAR_QUERY } from "@/lib/trip-focus";
import { plan } from "@/components/trip-planner/density";
import { cleanItemColor, itemAccentHex, type TripItemColor } from "@/lib/trip-item-color";
import { ForwardBookings } from "@/components/trip-planner/ForwardBookings";
import { PlanFold, PlanHint } from "@/components/trip-planner/PlanFold";
import { bookingProgress } from "@/lib/trip-workspace";
import { TripEntryDialog } from "@/components/trip-planner/TripEntryDialog";
import { ItemColorField } from "@/components/trip-planner/ItemColorField";
import {
  bookedStayHref,
  entryStatusLabel,
  entryTintProps,
  ItineraryItemRow,
} from "@/components/trip-planner/ItineraryItemRow";
import { WeekView } from "@/components/trip-planner/WeekView";
import { DownloadTripPdf } from "@/components/trip-planner/DownloadTripPdf";
import { PackingPanel } from "@/components/trip-planner/PackingPanel";
import { PremiumLockPrompt } from "@/components/premium/PremiumLockPrompt";
import { usePremium } from "@/components/premium/usePremium";
import type { PackingGuide } from "@/lib/packing-guides";

type Props = {
  headingId: string;
  config: TripPlannerConfig;
  partners: TripPlannerPartner[];
  state: PlannerState;
  items: TripItem[];
  flexibleOn: boolean;
  subhead: string;
  tripId: string | null;
  focusStay?: boolean;
  focusFlight?: boolean;
  tripTitle?: string;
  saveMode: TripSaveMode;
  guestBackup: StoredPlan | null;
  journalNotes: readonly JournalNote[];
  journalPlaceIndex: readonly JournalPlace[];
  packingNotes: string;
  packingGuides?: readonly PackingGuide[];
  onItemsChange: (items: TripItem[]) => void;
  onPackingNotesChange: (notes: string) => void;
  onEditTrip: () => void;
  onStartOver: () => void;
  saveDetail: string | null;
  onSaveToAccount: () => void;
  onDeclineMerge: () => void;
  onRetrySave: () => void;
  onRestoreBackup: () => void;
  onRememberGuestDraft: () => void;
};

function laneIcon(partner: TripPlannerPartner): string {
  if (partner.showWhen === "flights") return "plane";
  if (partner.showWhen === "hotel") return "hotel";
  if (partner.showWhen === "car") return "car";
  if (partner.key === "saily") return "wifi";
  if (partner.key === "world-nomads") return "shield";
  return "compass";
}

const ITEM_ICON: Record<TripItemType, string> = {
  flight: "plane",
  hotel: "hotel",
  car: "car",
  activity: "sparkles",
  note: "book-open",
  other: "bookmark",
};

function StatusChips({
  value,
  onChange,
  label,
}: {
  value: TripItemStatus;
  onChange: (status: TripItemStatus) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {TRIP_ITEM_STATUSES.map((status) => {
        const pressed = value === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(status)}
            className={`${plan.chip} ${
              pressed
                ? status === "booked"
                  ? "border-ink bg-ink text-on-solid"
                  : status === "skipped"
                    ? "border-border bg-surface-soft text-muted"
                    : "border-accent/30 bg-accent/15 text-accent"
                : "border-border bg-white text-text hover:border-border-strong"
            }`}
          >
            {status === "todo" ? "Planned" : TRIP_STATUS_LABEL[status]}
          </button>
        );
      })}
    </div>
  );
}

function laneName(partner: TripPlannerPartner): string {
  if (partner.showWhen === "flights") return "Flights";
  if (partner.showWhen === "hotel") return "Stay";
  if (partner.showWhen === "car") return "Car";
  if (partner.key === "world-nomads") return "Insurance";
  if (partner.key === "saily") return "eSIM";
  if (partner.key === "viator") return "Experiences";
  return partner.label;
}

function laneProgress(items: TripItem[]): "open" | "booked" | "skipped" {
  if (items.length === 0 || items.some((item) => item.status === "todo"))
    return "open";
  if (items.some((item) => item.status === "booked")) return "booked";
  return "skipped";
}

/** Sentinel lane pin for the forward-email panel. Not a partner key. */
const OUTSIDE_TAB = "outside";

function lanePanelId(
  headingId: string,
  partner: TripPlannerPartner,
  flightLaneKey: string,
  stayLaneKey: string,
): string {
  if (partner.key === flightLaneKey && isFlightLanePartner(partner))
    return FLIGHT_LANE_HASH;
  if (
    partner.key === stayLaneKey &&
    (partner.key === "booking" || partner.showWhen === "hotel")
  ) {
    return STAY_LANE_HASH;
  }
  return `${headingId}-lane-${partner.key}`;
}

function newestBookedStayId(items: TripItem[]): string | undefined {
  return items
    .filter((item) => item.type === "hotel" && item.status === "booked")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
}

function newestBookedFlightId(items: TripItem[]): string | undefined {
  return items
    .filter((item) => item.type === "flight" && item.status === "booked")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
}

function ItemUrl({
  item,
  compact = false,
}: {
  item: TripItem;
  compact?: boolean;
}) {
  const url = bookedStayHref(item) || item.url;
  if (!url) return null;
  const onSite = url.startsWith("/") && !url.startsWith("//");
  return (
    <OutboundLink
      href={url}
      target={onSite ? undefined : "_blank"}
      rel={onSite ? undefined : "noopener noreferrer"}
      className={`${plan.textBtn} truncate text-link hover:text-accent`}
    >
      {onSite
        ? flightItemLinkLabel(url) ||
          stayItemLinkLabel(url) ||
          (url.startsWith("/stays") ? "View stay" : "View")
        : compact
          ? url.replace(/^https?:\/\//, "")
          : "Open link"}
      {onSite ? null : <span className="sr-only"> (opens in a new tab)</span>}
    </OutboundLink>
  );
}

function itemWhen(item: TripItem, days: TripDay[]): string {
  const index = scheduledDayIndex(item, days);
  const day = index == null ? null : days.find((entry) => entry.index === index);
  const schedule =
    item.type === "car"
      ? [
          item.pickupDate && `Pick up ${item.pickupDate}${item.pickupTime ? ` at ${item.pickupTime}` : ""}`,
          item.dropoffDate && `Return ${item.dropoffDate}${item.dropoffTime ? ` at ${item.dropoffTime}` : ""}`,
          item.pickupLocation && `from ${item.pickupLocation}`,
          item.dropoffLocation && `to ${item.dropoffLocation}`,
        ]
      : item.type === "flight"
        ? [
            item.departureDate && `Depart ${item.departureDate}${item.departureTime ? ` at ${item.departureTime}` : ""}`,
            item.returnDate && `Return ${item.returnDate}${item.returnTime ? ` at ${item.returnTime}` : ""}`,
          ]
        : item.type === "hotel"
          ? [
              item.checkinDate && `Check in ${item.checkinDate}${item.checkinTime ? ` at ${item.checkinTime}` : ""}`,
              item.checkoutDate && `Check out ${item.checkoutDate}${item.checkoutTime ? ` at ${item.checkoutTime}` : ""}`,
            ]
          : [];
  return [
    day ? `${day.label} · ${day.detail}` : null,
    item.type === "car" || item.type === "flight" || item.type === "hotel"
      ? null
      : item.time ?? null,
    schedule.filter(Boolean).join(" · ") || null,
    item.confirmation ? `Conf. ${item.confirmation}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function BookingItemForm({
  type,
  laneKey,
  sortOrder,
  existing,
  days,
  framed,
  initialDay,
  onSave,
  onCancel,
}: {
  type: TripItemType;
  laneKey?: string;
  sortOrder: number;
  existing?: TripItem;
  days: TripDay[];
  framed?: boolean;
  initialDay?: number;
  onSave: (item: TripItem) => void;
  onCancel: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [url, setUrl] = useState(existing?.url ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [confirmation, setConfirmation] = useState(
    (existing?.confirmation ?? "").toUpperCase(),
  );
  const [dayIndex, setDayIndex] = useState(() => {
    if (!existing) return initialDay ? String(initialDay) : "";
    const index = scheduledDayIndex(existing, days);
    return index == null ? "" : String(index);
  });
  const [time, setTime] = useState(existing?.time ?? "");
  const [pickupLocation, setPickupLocation] = useState(
    existing?.pickupLocation ?? "",
  );
  const [dropoffLocation, setDropoffLocation] = useState(
    existing?.dropoffLocation ?? "",
  );
  const [pickupDate, setPickupDate] = useState(existing?.pickupDate ?? "");
  const [dropoffDate, setDropoffDate] = useState(existing?.dropoffDate ?? "");
  const [pickupTime, setPickupTime] = useState(existing?.pickupTime ?? "");
  const [dropoffTime, setDropoffTime] = useState(existing?.dropoffTime ?? "");
  const [departureDate, setDepartureDate] = useState(
    existing?.departureDate ?? "",
  );
  const [returnDate, setReturnDate] = useState(existing?.returnDate ?? "");
  const [departureTime, setDepartureTime] = useState(
    existing?.departureTime ?? "",
  );
  const [returnTime, setReturnTime] = useState(existing?.returnTime ?? "");
  const [checkinDate, setCheckinDate] = useState(existing?.checkinDate ?? "");
  const [checkoutDate, setCheckoutDate] = useState(
    existing?.checkoutDate ?? "",
  );
  const [checkinTime, setCheckinTime] = useState(existing?.checkinTime ?? "");
  const [checkoutTime, setCheckoutTime] = useState(
    existing?.checkoutTime ?? "",
  );
  const [status, setStatus] = useState<TripItemStatus>(
    existing?.status ?? "todo",
  );
  const [color, setColor] = useState<TripItemColor | "">(
    existing?.color ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function fillFromPaste() {
    const found = extractBookingPaste(paste);
    const day = mentionedTripDay(days, paste);
    if (!found.url && !found.confirmation && !found.time && day == null) {
      setPasteNote(
        "No link, confirmation code, time, or trip day in that text. Fill the fields yourself.",
      );
      return;
    }
    if (found.url) setUrl(found.url);
    if (found.confirmation) setConfirmation(found.confirmation.toUpperCase());
    if (found.time) setTime(found.time);
    if (day != null) setDayIndex(String(day));
    setError(null);
    setPasteNote(
      "Filled from the text you pasted. This only reads that text — it does not open booking sites.",
    );
  }

  return (
    <form
      className={
        framed
          ? `${plan.inset} plan-stack-tight`
          : "plan-stack-tight plan-section border-t border-border pt-4"
      }
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedUrl = url.trim();
        if (trimmedUrl && !isTripItemUrl(trimmedUrl)) {
          setError(
            "Use a full http:// or https:// link, or a link on this site.",
          );
          return;
        }
        if (
          !trimmedUrl &&
          !title.trim() &&
          !notes.trim() &&
          !confirmation.trim()
        ) {
          setError("Add a title, a link, a confirmation number, or a note.");
          return;
        }
        const parsedDay = cleanDayIndex(dayIndex || null);
        const cleanedConfirmation = cleanConfirmation(confirmation).toUpperCase();
        const cleanedTime = cleanTime(time);
        const cleanedPickupDate = cleanItemDate(pickupDate);
        const cleanedDropoffDate = cleanItemDate(dropoffDate);
        const cleanedPickupTime = cleanTime(pickupTime);
        const cleanedDropoffTime = cleanTime(dropoffTime);
        const cleanedDepartureDate = cleanItemDate(departureDate);
        const cleanedReturnDate = cleanItemDate(returnDate);
        const cleanedDepartureTime = cleanTime(departureTime);
        const cleanedReturnTime = cleanTime(returnTime);
        const cleanedCheckinDate = cleanItemDate(checkinDate);
        const cleanedCheckoutDate = cleanItemDate(checkoutDate);
        const cleanedCheckinTime = cleanTime(checkinTime);
        const cleanedCheckoutTime = cleanTime(checkoutTime);
        if (type === "car") {
          if (Boolean(cleanedPickupDate) !== Boolean(cleanedDropoffDate)) {
            setError("Add both pickup and return dates.");
            return;
          }
          if (
            cleanedPickupDate &&
            cleanedDropoffDate &&
            cleanedDropoffDate < cleanedPickupDate
          ) {
            setError("Return date can’t be before pickup.");
            return;
          }
        }
        if (type === "hotel") {
          if (Boolean(cleanedCheckinDate) !== Boolean(cleanedCheckoutDate)) {
            setError("Add both check-in and check-out dates.");
            return;
          }
          if (
            cleanedCheckinDate &&
            cleanedCheckoutDate &&
            cleanedCheckoutDate <= cleanedCheckinDate
          ) {
            setError("Check-out must be after check-in.");
            return;
          }
        }
        if (
          type === "flight" &&
          cleanedDepartureDate &&
          cleanedReturnDate &&
          cleanedReturnDate < cleanedDepartureDate
        ) {
          setError("Return date can’t be before departure.");
          return;
        }
        const chosenColor = cleanItemColor(color);
        if (existing) {
          const next: TripItem = {
            ...existing,
            title: title.trim().slice(0, 160) || existing.title,
            url: trimmedUrl,
            notes: notes.trim().slice(0, 2000),
            status,
            updatedAt: new Date().toISOString(),
          };
          if (chosenColor) next.color = chosenColor;
          else delete next.color;
          if (cleanedConfirmation) next.confirmation = cleanedConfirmation;
          else delete next.confirmation;
          if (parsedDay) next.dayIndex = parsedDay;
          else delete next.dayIndex;
          if (cleanedTime) next.time = cleanedTime;
          else delete next.time;
          if (type === "car") {
            if (pickupLocation.trim()) next.pickupLocation = pickupLocation.trim().slice(0, 160);
            else delete next.pickupLocation;
            if (dropoffLocation.trim()) next.dropoffLocation = dropoffLocation.trim().slice(0, 160);
            else delete next.dropoffLocation;
            if (cleanedPickupDate) next.pickupDate = cleanedPickupDate;
            else delete next.pickupDate;
            if (cleanedDropoffDate) next.dropoffDate = cleanedDropoffDate;
            else delete next.dropoffDate;
            if (cleanedPickupTime) next.pickupTime = cleanedPickupTime;
            else delete next.pickupTime;
            if (cleanedDropoffTime) next.dropoffTime = cleanedDropoffTime;
            else delete next.dropoffTime;
          }
          if (type === "flight") {
            if (cleanedDepartureDate) next.departureDate = cleanedDepartureDate;
            else delete next.departureDate;
            if (cleanedReturnDate) next.returnDate = cleanedReturnDate;
            else delete next.returnDate;
            if (cleanedDepartureTime) next.departureTime = cleanedDepartureTime;
            else delete next.departureTime;
            if (cleanedReturnTime) next.returnTime = cleanedReturnTime;
            else delete next.returnTime;
          }
          if (type === "hotel") {
            if (cleanedCheckinDate) next.checkinDate = cleanedCheckinDate;
            else delete next.checkinDate;
            if (cleanedCheckoutDate) next.checkoutDate = cleanedCheckoutDate;
            else delete next.checkoutDate;
            if (cleanedCheckinTime) next.checkinTime = cleanedCheckinTime;
            else delete next.checkinTime;
            if (cleanedCheckoutTime) next.checkoutTime = cleanedCheckoutTime;
            else delete next.checkoutTime;
          }
          onSave(next);
          return;
        }
        onSave(
          createTripItem({
            type,
            laneKey,
            sortOrder,
            title,
            url: trimmedUrl,
            notes,
            confirmation: cleanedConfirmation,
            dayIndex: parsedDay,
            time: cleanedTime,
            pickupLocation: type === "car" ? pickupLocation : undefined,
            dropoffLocation: type === "car" ? dropoffLocation : undefined,
            pickupDate: type === "car" ? cleanedPickupDate : undefined,
            dropoffDate: type === "car" ? cleanedDropoffDate : undefined,
            pickupTime: type === "car" ? cleanedPickupTime : undefined,
            dropoffTime: type === "car" ? cleanedDropoffTime : undefined,
            departureDate: type === "flight" ? cleanedDepartureDate : undefined,
            returnDate: type === "flight" ? cleanedReturnDate : undefined,
            departureTime: type === "flight" ? cleanedDepartureTime : undefined,
            returnTime: type === "flight" ? cleanedReturnTime : undefined,
            checkinDate: type === "hotel" ? cleanedCheckinDate : undefined,
            checkoutDate: type === "hotel" ? cleanedCheckoutDate : undefined,
            checkinTime: type === "hotel" ? cleanedCheckinTime : undefined,
            checkoutTime: type === "hotel" ? cleanedCheckoutTime : undefined,
            status,
            color: chosenColor,
          }),
        );
      }}
    >
      {type !== "note" ? (
        <details className="plan-paste-details">
          <summary className={plan.textBtn}>
            Paste a confirmation (optional)
          </summary>
          <label className="plan-field">
            <span className={plan.label}>
              Paste booking details{" "}
              <span className="font-normal normal-case tracking-normal">
                (optional)
              </span>
            </span>
            <textarea
              className={plan.input}
              rows={3}
              placeholder="Paste a confirmation email or summary"
              value={paste}
              onChange={(event) => {
                setPaste(event.target.value);
                setPasteNote(null);
              }}
            />
          </label>
          <p className={`${plan.prose} text-muted plan-desktop-only`}>
            Looks for a link, a confirmation code, a time, and a trip day in the
            text you paste. It does not open or scrape booking sites.
          </p>
          <PlanHint label="What paste reads" mobileOnly>
            Looks for a link, a confirmation code, a time, and a trip day in the
            text you paste. It does not open or scrape booking sites.
          </PlanHint>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fillFromPaste}
          >
            Fill from paste
          </button>
          {pasteNote ? (
            <p className={`${plan.body} text-text`} role="status">
              {pasteNote}
            </p>
          ) : null}
        </details>
      ) : null}
      <label className="plan-field">
        <span className={plan.label}>Title</span>
        <input
          className={plan.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <ItemColorField type={type} title={title} value={color} onChange={setColor} />
      <label className="plan-field">
        <span className={plan.label}>Link</span>
        <input
          className={plan.input}
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
        />
      </label>
      {type !== "note" ? (
        <label className="plan-field">
          <span className={plan.label}>
            Confirmation #{" "}
            <span className="font-normal normal-case tracking-normal">
              (optional)
            </span>
          </span>
          <input
            className={plan.input}
            maxLength={40}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={confirmation}
            onChange={(event) => {
              const input = event.currentTarget;
              const next = input.value.toUpperCase();
              if (next !== input.value && next.length === input.value.length) {
                // Uppercase in place so the caret stays where the reader is typing.
                const { selectionStart, selectionEnd } = input;
                input.value = next;
                if (selectionStart !== null && selectionEnd !== null) {
                  input.setSelectionRange(selectionStart, selectionEnd);
                }
              }
              setConfirmation(next);
            }}
          />
        </label>
      ) : null}
      {!(["car", "flight", "hotel"] as TripItemType[]).includes(type) ? (
      <div className="plan-grid-2">
        <label className="plan-field">
          <span className={plan.label}>Day</span>
          <select
            className={plan.input}
            value={dayIndex}
            onChange={(event) => setDayIndex(event.target.value)}
          >
            <option value="">Unscheduled</option>
            {days.map((day) => (
              <option key={day.index} value={day.index}>
                {day.label}
                {day.detail ? ` · ${day.detail}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="plan-field">
          <span className={plan.label}>
            Time{" "}
            <span className="font-normal normal-case tracking-normal">
              (optional)
            </span>
          </span>
          <input
            className={plan.input}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value.slice(0, 5))}
          />
        </label>
      </div>
      ) : null}
      {type === "car" ? (
        <fieldset className="plan-stack-tight rounded-lg border border-border bg-surface-soft p-3">
          <legend className={`${plan.label} px-1`}>Car details</legend>
          <div className="plan-grid-2">
            <label className="plan-field">
              <span className={plan.label}>Pickup location</span>
              <input
                className={plan.input}
                value={pickupLocation}
                onChange={(event) => setPickupLocation(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Return location</span>
              <input
                className={plan.input}
                value={dropoffLocation}
                onChange={(event) => setDropoffLocation(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Pickup date</span>
              <input
                className={plan.input}
                type="date"
                value={pickupDate}
                onChange={(event) => setPickupDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Return date</span>
              <input
                className={plan.input}
                type="date"
                value={dropoffDate}
                onChange={(event) => setDropoffDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Pickup time</span>
              <input
                className={plan.input}
                type="time"
                value={pickupTime}
                onChange={(event) => setPickupTime(event.target.value.slice(0, 5))}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Return time</span>
              <input
                className={plan.input}
                type="time"
                value={dropoffTime}
                onChange={(event) => setDropoffTime(event.target.value.slice(0, 5))}
              />
            </label>
          </div>
        </fieldset>
      ) : null}
      {type === "flight" ? (
        <fieldset className="plan-stack-tight rounded-lg border border-border bg-surface-soft p-3">
          <legend className={`${plan.label} px-1`}>Flight schedule</legend>
          <div className="plan-grid-2">
            <label className="plan-field">
              <span className={plan.label}>Departure date</span>
              <input
                className={plan.input}
                type="date"
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Return date</span>
              <input
                className={plan.input}
                type="date"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Departure time</span>
              <input
                className={plan.input}
                type="time"
                value={departureTime}
                onChange={(event) => setDepartureTime(event.target.value.slice(0, 5))}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Return time</span>
              <input
                className={plan.input}
                type="time"
                value={returnTime}
                onChange={(event) => setReturnTime(event.target.value.slice(0, 5))}
              />
            </label>
          </div>
        </fieldset>
      ) : null}
      {type === "hotel" ? (
        <fieldset className="plan-stack-tight rounded-lg border border-border bg-surface-soft p-3">
          <legend className={`${plan.label} px-1`}>Stay schedule</legend>
          <div className="plan-grid-2">
            <label className="plan-field">
              <span className={plan.label}>Check-in date</span>
              <input
                className={plan.input}
                type="date"
                value={checkinDate}
                onChange={(event) => setCheckinDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Check-out date</span>
              <input
                className={plan.input}
                type="date"
                value={checkoutDate}
                onChange={(event) => setCheckoutDate(event.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Check-in time</span>
              <input
                className={plan.input}
                type="time"
                value={checkinTime}
                onChange={(event) => setCheckinTime(event.target.value.slice(0, 5))}
              />
            </label>
            <label className="plan-field">
              <span className={plan.label}>Check-out time</span>
              <input
                className={plan.input}
                type="time"
                value={checkoutTime}
                onChange={(event) => setCheckoutTime(event.target.value.slice(0, 5))}
              />
            </label>
          </div>
        </fieldset>
      ) : null}
      {type !== "note" ? (
        <div className="plan-stack-tight">
          <p className={plan.label}>Status</p>
          <StatusChips
            value={status}
            label="Booking status"
            onChange={setStatus}
          />
        </div>
      ) : null}
      <label className="plan-field">
        <span className={plan.label}>
          Notes{" "}
          <span className="font-normal normal-case tracking-normal">
            (optional)
          </span>
        </span>
        <textarea
          className={plan.input}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {error ? (
        <p className={plan.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className="plan-actions plan-actions-inline plan-sticky plan-sticky-page">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {existing ? "Save changes" : "Add to itinerary"}
        </button>
      </div>
    </form>
  );
}

function ItemCard({
  item,
  days,
  onStatus,
  onEdit,
  onRemove,
  highlighted = false,
}: {
  item: TripItem;
  days: TripDay[];
  onStatus: (status: TripItemStatus) => void;
  onEdit: () => void;
  onRemove: () => void;
  highlighted?: boolean;
}) {
  const when = itemWhen(item, days);
  const detail = [when, item.notes.replace(/\s+/g, " ").trim()].filter(Boolean).join(" · ");
  return (
    <Card className={highlighted ? "ring-2 ring-ink" : ""}>
      <ListRow
        leading={
          <span style={{ color: itemAccentHex(item) }} aria-hidden="true">
            <NavIcon name={ITEM_ICON[item.type]} size={18} />
          </span>
        }
        title={item.title}
        detail={detail || TRIP_STATUS_LABEL[item.status]}
        trailing={
          <span className="ui-row-actions">
            <button type="button" className="ui-row-action" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="ui-row-action" onClick={onRemove}>
              Remove
            </button>
          </span>
        }
      />
      <ItemUrl item={item} compact />
      <StatusChips
        value={item.status}
        label={`Status for ${item.title}`}
        onChange={onStatus}
      />
    </Card>
  );
}

function TimelineEntry({
  item,
  days,
  editing,
  onEdit,
  onRemove,
  onSave,
  onCancel,
}: {
  item: TripItem;
  days: TripDay[];
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onSave: (item: TripItem) => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <BookingItemForm
        framed
        type={item.type}
        existing={item}
        days={days}
        sortOrder={item.sortOrder}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ItineraryItemRow item={item} onEdit={onEdit} onRemove={onRemove} />
  );
}

function JournalNotes({
  headingId,
  destination,
  notes,
  places,
}: {
  headingId: string;
  destination: string;
  notes: readonly JournalNote[];
  places: readonly JournalPlace[];
}) {
  const matches = journalNotesForDestination(notes, places, destination);
  const place = destination.split(",")[0]?.trim() || destination.trim();
  return (
    <section className="plan-block" aria-labelledby={`${headingId}-journal`}>
      <h3 id={`${headingId}-journal`} className={plan.h3}>
        From Alex’s journal
      </h3>
      {matches.length === 0 ? (
        <>
          <p className={`${plan.caption} text-muted sm:hidden`}>
            No notes for {place} yet.
          </p>
          <p
            className={`${plan.prose} plan-follow text-muted plan-desktop-only`}
          >
            No journal notes for {place} yet. When a story from that trip is on
            the site, it will show up here.
          </p>
        </>
      ) : (
        <ul className="plan-grid-2 plan-follow">
          {matches.map((note) => (
            <li key={note.slug}>
              <Link
                href={`/${note.slug}`}
                className="panel-interactive plan-inset flex h-full flex-col"
              >
                <span className={plan.h4}>{note.title}</span>
                {note.excerpt ? (
                  <span
                    className={`${plan.body} plan-follow line-clamp-3 text-text`}
                  >
                    {note.excerpt}
                  </span>
                ) : null}
                <span
                  className={`${plan.caption} plan-follow font-semibold text-link`}
                >
                  Read story
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LaneCta({
  partner,
  state,
  flexibleOn,
  tripId,
  className,
}: {
  partner: TripPlannerPartner;
  state: PlannerState;
  flexibleOn: boolean;
  tripId: string | null;
  className: string;
}) {
  const inApp =
    partner.key === "viator" ||
    partner.key === "booking" ||
    isFlightLanePartner(partner);
  const href =
    partner.key === "booking"
      ? hotelLaneHref(state, flexibleOn, tripId)
      : partnerLaneHref(partner, state, flexibleOn, tripId);
  return (
    <OutboundLink
      href={href}
      affiliate={!inApp}
      tripHop={!inApp}
      target={inApp ? undefined : "_blank"}
      rel={inApp ? undefined : "noopener noreferrer sponsored"}
      className={className}
    >
      {partner.buttonLabel}
      {inApp ? null : <span className="sr-only"> (opens in a new tab)</span>}
    </OutboundLink>
  );
}

export function ItineraryHub({
  headingId,
  config,
  partners,
  state,
  items,
  flexibleOn,
  subhead,
  tripId,
  focusStay = false,
  focusFlight = false,
  tripTitle,
  saveMode,
  guestBackup,
  journalNotes,
  journalPlaceIndex,
  packingNotes,
  packingGuides = [],
  onItemsChange,
  onPackingNotesChange,
  onEditTrip,
  onStartOver,
  saveDetail,
  onSaveToAccount,
  onDeclineMerge,
  onRetrySave,
  onRestoreBackup,
  onRememberGuestDraft,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shareLocked, setShareLocked] = useState(false);
  const premium = usePremium();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, updateView] = useState<"overview" | "itinerary" | "bookings" | "packing">(
    focusStay || focusFlight ? "bookings" : "overview",
  );
  const [addMenu, setAddMenu] = useState(false);
  const viewKey = `aj.trip-workspace:${tripId ?? state.destination}:${state.startDate || state.month}`;
  function setView(next: "overview" | "itinerary" | "bookings" | "packing") {
    updateView(next);
    try {
      sessionStorage.setItem(viewKey, next);
    } catch {
      /* In-memory navigation still works. */
    }
    setAddMenu(false);
    if (window.matchMedia(TRIP_SECTION_BAR_QUERY).matches) {
      window.scrollTo(0, 0);
      if (next === "packing") {
        window.requestAnimationFrame(() => {
          document.getElementById(`${headingId}-view-packing`)?.scrollIntoView({
            block: "start",
          });
        });
      }
    }
  }
  useEffect(() => {
    let frame = 0;
    let restoreFrame = 0;
    try {
      const saved = sessionStorage.getItem(viewKey);
      const scroll = Number(sessionStorage.getItem(`${viewKey}:scroll`));
      const returningToBooking =
        focusStay ||
        focusFlight ||
        [FLIGHT_LANE_HASH, STAY_LANE_HASH].includes(
          window.location.hash.slice(1),
        );
      if (
        !returningToBooking &&
        (saved === "overview" || saved === "itinerary" || saved === "bookings" || saved === "packing")
      ) {
        frame = requestAnimationFrame(() => {
          updateView(saved);
          restoreFrame = requestAnimationFrame(() => {
            if (Number.isFinite(scroll) && scroll > 0)
              window.scrollTo(0, scroll);
          });
        });
      }
    } catch {
      /* Session storage is optional. */
    }
    const rememberScroll = () => {
      try {
        sessionStorage.setItem(`${viewKey}:scroll`, String(window.scrollY));
      } catch {
        /* Ignore unavailable storage. */
      }
    };
    window.addEventListener("pagehide", rememberScroll);
    return () => {
      rememberScroll();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener("pagehide", rememberScroll);
    };
  }, [viewKey, focusStay, focusFlight]);
  const [quickEntry, setQuickEntry] = useState<{
    type: TripItemType;
    day?: number;
    laneKey?: string;
  } | null>(null);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const [moreMenuSession, setMoreMenuSession] = useState(0);
  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const menu = moreMenuRef.current;
      if (!menu?.open) return;
      const target = event.target;
      if (target instanceof Node && menu.contains(target)) return;
      menu.open = false;
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);
  const nextPartner = partners.find((partner) => {
    if (partner.showWhen === "extra") return false;
    const entries = itemsForLane(items, partner);
    return (
      entries.length === 0 || entries.some((item) => item.status === "todo")
    );
  });
  function openBookings(key?: string) {
    setView("bookings");
    if (key) setLanePin(key);
  }

  const nextLaneKey =
    partners.find(
      (partner) => laneProgress(itemsForLane(items, partner)) === "open",
    )?.key ?? null;
  const flightLaneKey =
    partners.find((partner) => isFlightLanePartner(partner))?.key ?? "expedia";
  const stayLaneKey =
    partners.find((partner) => partner.key === "booking")?.key ??
    partners.find((partner) => partner.showWhen === "hotel")?.key ??
    "booking";
  const [lanePin, setLanePin] = useState<string>(
    focusFlight ? flightLaneKey : focusStay ? stayLaneKey : "auto",
  );
  useEffect(() => {
    if (!focusFlight && !focusStay) return;
    const frame = window.requestAnimationFrame(() => {
      updateView("bookings");
      setLanePin(focusFlight ? flightLaneKey : stayLaneKey);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusFlight, focusStay, flightLaneKey, stayLaneKey]);
  const outsideSelected = lanePin === OUTSIDE_TAB;
  const pinnedLane =
    !outsideSelected &&
    lanePin !== "auto" &&
    partners.some((partner) => partner.key === lanePin)
      ? lanePin
      : null;
  const selectedLaneKey = outsideSelected
    ? null
    : (pinnedLane ?? nextLaneKey ?? partners[0]?.key ?? null);
  const appliedHash = useRef<string | null>(null);
  const [layout, setLayout] = useState<"timeline" | "week">("timeline");
  const [editor, setEditor] = useState<
    | { kind: "add-lane"; laneKey: string }
    | { kind: "add-note" }
    | { kind: "edit"; id: string; place: "lane" | "day" }
    | null
  >(null);
  const dates = dateSummary(state, flexibleOn);
  const travelers = travelerSummary(state);
  const days = tripDays(state, flexibleOn);
  const sorted = [...items].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.updatedAt.localeCompare(b.updatedAt),
  );
  const nextSort =
    sorted.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  const unscheduled = sorted
    .filter((item) => scheduledDayIndex(item, days) == null)
    .sort(compareScheduledItems);

  function renderTimeline(list: TripItem[]) {
    const ordered = [...list].sort(compareScheduledItems);
    return (
      <ol className="plan-timeline">
        {ordered.map((item) => (
          <li key={item.id}>
            <TimelineEntry
              item={item}
              days={days}
              editing={
                editor?.kind === "edit" &&
                editor.place === "day" &&
                editor.id === item.id
              }
              onEdit={() => setEditingId(item.id)}
              onRemove={() => removeItem(item.id)}
              onSave={replaceItem}
              onCancel={() => setEditor(null)}
            />
          </li>
        ))}
      </ol>
    );
  }

  function updateItem(id: string, patch: Partial<TripItem>) {
    onItemsChange(
      items.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  function removeItem(id: string) {
    onItemsChange(items.filter((item) => item.id !== id));
    setEditor((current) =>
      current?.kind === "edit" && current.id === id ? null : current,
    );
  }

  function replaceItem(next: TripItem) {
    onItemsChange(items.map((item) => (item.id === next.id ? next : item)));
    setEditor(null);
  }

  function addItem(item: TripItem) {
    onItemsChange([...items, item]);
    setEditor(null);
  }

  function assignDay(id: string, dayIndex: number | null) {
    const nextIndex =
      dayIndex != null && dayIndex >= 1 && dayIndex <= days.length
        ? dayIndex
        : null;
    onItemsChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const current = scheduledDayIndex(item, days);
        if (current === nextIndex) return item;
        const next: TripItem = { ...item, updatedAt: new Date().toISOString() };
        if (nextIndex == null) delete next.dayIndex;
        else next.dayIndex = nextIndex;
        return next;
      }),
    );
  }

  useEffect(() => {
    function laneKeyForHash(hash: string): string | null {
      if (hash === FLIGHT_LANE_HASH) {
        return (
          partners.find((partner) => isFlightLanePartner(partner))?.key ?? null
        );
      }
      if (hash === STAY_LANE_HASH) {
        return (
          partners.find((partner) => partner.key === "booking")?.key ??
          partners.find((partner) => partner.showWhen === "hotel")?.key ??
          null
        );
      }
      return null;
    }
    function applyHash(force: boolean) {
      const hash = window.location.hash.replace(/^#/, "");
      const key = laneKeyForHash(hash);
      if (!key) return;
      if (!force && appliedHash.current === hash) return;
      appliedHash.current = hash;
      setLanePin(key);
      updateView("bookings");
      window.requestAnimationFrame(() => {
        document
          .querySelector(".plan-hub-lanes")
          ?.scrollIntoView({ block: "start" });
      });
    }
    applyHash(false);
    const onHashChange = () => applyHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [partners]);

  useEffect(() => {
    if (!selectedLaneKey) return;
    const tab = document.getElementById(`${headingId}-tab-${selectedLaneKey}`);
    const scroller = tab?.parentElement;
    if (!(tab instanceof HTMLElement) || !(scroller instanceof HTMLElement))
      return;
    const tabStart = tab.offsetLeft;
    const tabEnd = tabStart + tab.offsetWidth;
    const viewEnd = scroller.scrollLeft + scroller.clientWidth;
    if (tabStart < scroller.scrollLeft) scroller.scrollLeft = tabStart;
    else if (tabEnd > viewEnd)
      scroller.scrollLeft = tabEnd - scroller.clientWidth;
  }, [headingId, selectedLaneKey]);

  function onLaneTabKeyDown(
    event: { key: string; preventDefault: () => void },
    current: string,
  ) {
    const order = [...partners.map((partner) => partner.key), OUTSIDE_TAB];
    const index = order.indexOf(current);
    if (index < 0) return;
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % order.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + order.length) % order.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = order.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = order[nextIndex];
    if (!next) return;
    setLanePin(next);
    const tabId =
      next === OUTSIDE_TAB
        ? `${headingId}-outside-tab`
        : `${headingId}-tab-${next}`;
    window.requestAnimationFrame(() => {
      document.getElementById(tabId)?.focus();
    });
  }

  const saveCopy =
    saveMode === "pending"
      ? "Unsaved changes"
      : saveMode === "saving"
        ? "Saving…"
        : saveMode === "saved"
          ? "Saved to your account"
          : saveMode === "unavailable"
            ? saveDetail || TRIPS_ACCOUNT_UNAVAILABLE
            : saveMode === "error"
              ? saveDetail ||
                "Couldn’t save to your account. This copy stays in this browser."
              : null;

  const addToTripMenu = (
    <div className="plan-add-menu">
      <button
        type="button"
        className="btn btn-secondary"
        id={`${headingId}-add-trigger`}
        aria-expanded={addMenu}
        aria-controls={`${headingId}-add-options`}
        onClick={() => setAddMenu(!addMenu)}
      >
        + Add to trip
      </button>
      {addMenu ? (
        <div id={`${headingId}-add-options`} className="plan-add-options glass-strong">
          {(
            [
              ["activity", "Activity"],
              ["note", "Note"],
              ["other", "Booking"],
            ] as const
          ).map(([type, label]) => (
            <button
              type="button"
              key={type}
              onClick={() => {
                setQuickEntry({ type });
                setAddMenu(false);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              openBookings(OUTSIDE_TAB);
              setAddMenu(false);
            }}
          >
            Import a booking
          </button>
        </div>
      ) : null}
    </div>
  );

  const nextTitle = nextPartner
    ? itemsForLane(items, nextPartner).length
      ? "Review your plans"
      : nextPartner.showWhen === "hotel"
        ? "Find somewhere to stay"
        : nextPartner.showWhen === "flights"
          ? "Find your way there"
          : "Find a car for your trip"
    : "Make room for the memorable";
  const nextSubtitle = nextPartner
    ? "Keep options and confirmations in one place."
    : "Add an activity, a place, or a note for later.";

  return (
    <div className="plan-hub plan-workspace" data-view={view}>
      <div className="plan-hub-lead plan-stack-tight">
        <TripDestinationHero
          fallbackImage={config.fallbackImage}
          destination={state.destination}
          title={tripTitle || state.destination.trim() || config.steps.next.heading}
          headingId={headingId}
          meta={[dates, travelers].filter(Boolean).join(" · ")}
          back={
            <Link href="/account#trips" className="plan-hero-back glass-strong">
              ← My trips
            </Link>
          }
          actions={
        <>
          <button
            type="button"
            className="plan-hero-action glass-strong"
            aria-label="Share a copy"
            title="Share a copy"
            onClick={async () => {
              // Share links are a Premium perk. Opening a shared link stays free.
              if (premium.loading) return;
              if (!premium.isPremium) {
                setShareLocked(true);
                return;
              }
              setShareLocked(false);
              const url = `${window.location.origin}${sharePlanHref({
                state,
                items,
                packingNotes,
              })}`;
              const outcome = await nativeShare({ title: tripTitle || `Trip to ${state.destination}`, url });
              if (outcome !== "unavailable") return;
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                const field = document.createElement("textarea");
                field.value = url;
                document.body.appendChild(field);
                field.select();
                document.execCommand("copy");
                field.remove();
              }
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            }}
          >
            <Share2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="plan-hero-action glass-strong"
            aria-label="Edit details"
            title="Edit details"
            onClick={onEditTrip}
          >
            <Pencil size={18} aria-hidden="true" />
          </button>
          <details
            className="plan-trip-menu"
            ref={moreMenuRef}
            onToggle={(event) => {
              if (!event.currentTarget.open) setMoreMenuSession((value) => value + 1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
                return;
              }
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role='menuitem']:not(:disabled)",
                ),
              ];
              if (!items.length) return;
              event.preventDefault();
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "ArrowDown"
                  ? items[(index + 1) % items.length]
                  : items[(index - 1 + items.length) % items.length];
              next?.focus();
            }}
          >
            <summary className="plan-hero-action glass-strong" aria-label="More options" title="More options"><Ellipsis size={20} aria-hidden="true" /></summary>
            <div className="plan-trip-menu-panel glass-strong" role="menu" aria-label="More options">
              <DownloadTripPdf
                headingId={headingId}
                session={moreMenuSession}
                source={{
                  title: tripTitle?.trim() || state.destination.trim() || "Trip",
                  destination: state.destination,
                  dates,
                  days,
                  items,
                  packingNotes,
                }}
              />
              <div className="plan-trip-menu-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="plan-trip-menu-item"
                onClick={() => {
                  if (moreMenuRef.current) moreMenuRef.current.open = false;
                  onStartOver();
                }}
              >
                Start a new trip
              </button>
            </div>
          </details>
        </>
          }
        />
        <p className={`${plan.prose} text-muted plan-desktop-only`}>
          {subhead}
        </p>

      </div>
      {saveMode === "local" && !copied ? (
        <p className="plan-hero-sync">
          <span>Saved on this device</span>
          <Link
            href={planATripLoginHref(tripId, "signin")}
            className="plan-trip-summary-signin"
            onClick={onRememberGuestDraft}
          >
            Sign in
          </Link>
        </p>
      ) : null}
      {shareLocked && !premium.isPremium ? (
        <div className="plan-hub-save">
          <PremiumLockPrompt
            message="Sharing a trip link is a Premium perk."
            detail="Members can send anyone a copy of this trip. The PDF download stays free in the menu."
            secondary={
              <button
                type="button"
                className="btn btn-secondary w-full sm:w-auto"
                onClick={() => setShareLocked(false)}
              >
                Not now
              </button>
            }
          />
        </div>
      ) : null}
      {saveMode === "limit" ? (
        <div className="plan-hub-save">
          <PremiumLockPrompt
            message={saveDetail || FREE_TRIP_LIMIT_MESSAGE}
            detail="This trip stays in this browser. Your saved trips are all still in My trips."
          />
        </div>
      ) : null}
      {copied ||
      saveMode === "offer" ||
      saveMode === "declined" ||
      saveCopy ||
      saveMode === "unavailable" ||
      saveMode === "error" ? (
      <div className="plan-hub-save">
        {copied ? (
          <p
            className={`${plan.caption} plan-follow font-semibold text-heading`}
            role="status"
          >
            <span className="plan-mobile-only">Link copied.</span>
            <span className="plan-desktop-only">
              Link copied. Anyone with it can open this snapshot. Later edits
              are not shared.
            </span>
          </p>
        ) : null}

        {saveMode === "offer" ? (
          <aside
            className={`${plan.soft} plan-section plan-stack-tight`}
            aria-label="Save itinerary to your account"
          >
            <p className={`${plan.prose} text-text`}>
              Save this browser itinerary to your account so you can open it
              later?
            </p>
            <div className="plan-actions plan-actions-inline">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSaveToAccount}
              >
                Save itinerary
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onDeclineMerge}
              >
                Keep it on this device
              </button>
            </div>
          </aside>
        ) : null}

        {saveMode === "declined" ? (
          <div className="plan-toolbar plan-section">
            <p className={`${plan.body} text-muted`}>
              This itinerary stays in this browser.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSaveToAccount}
            >
              Save to your account
            </button>
          </div>
        ) : null}

        {saveCopy ? (
          <p
            className={`${plan.caption} plan-follow font-semibold text-heading`}
            role="status"
          >
            {saveCopy}
            {saveMode === "saved" ? (
              <>
                {" "}
                <Link
                  href="/account#trips"
                  className="font-semibold text-heading underline underline-offset-2"
                >
                  View in My trips
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {saveMode === "unavailable" || saveMode === "error" ? (
          <div className="plan-actions plan-actions-inline plan-follow">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRetrySave}
            >
              Try saving again
            </button>
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="plan-workspace-toolbar">
        <div
          className="plan-workspace-tabs app-tab-bar"
          role="tablist"
          aria-label="Trip workspace"
        >
          {(["overview", "itinerary", "bookings", "packing"] as const).map(
            (tab, index, tabs) => (
              <button
                key={tab}
                id={`${headingId}-workspace-${tab}`}
                type="button"
                role="tab"
                className="app-tab-bar-item"
                aria-selected={view === tab}
                aria-controls={`${headingId}-view-${tab}`}
                tabIndex={view === tab ? 0 : -1}
                onClick={() => setView(tab)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? tabs[(index + 1) % tabs.length]
                      : event.key === "ArrowLeft"
                        ? tabs[(index + tabs.length - 1) % tabs.length]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs[tabs.length - 1]
                            : null;
                  if (!next) return;
                  event.preventDefault();
                  setView(next);
                  document
                    .getElementById(`${headingId}-workspace-${next}`)
                    ?.focus();
                }}
              >
                <BottomTabItemBody
                  icon={{ overview: "compass", itinerary: "map-pin", bookings: "book-marked", packing: "backpack" }[tab]}
                  label={
                    tab === "overview"
                      ? "Overview"
                      : tab === "itinerary"
                        ? "Itinerary"
                        : tab === "bookings"
                          ? "Bookings"
                          : "Packing"
                  }
                />
              </button>
            ),
          )}
        </div>
      </div>
      <section
        id={`${headingId}-view-overview`}
        role="tabpanel"
        aria-labelledby={`${headingId}-workspace-overview`}
        hidden={view !== "overview"}
        className="plan-overview"
      >
        <div className="plan-overview-main">
          <div className="plan-next-action">
            <SectionHeader as="h3" title={nextTitle} subtitle={nextSubtitle} />
            <div className="plan-next-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  nextPartner
                    ? openBookings(nextPartner.key)
                    : setQuickEntry({ type: "activity" })
                }
              >
                {nextPartner
                  ? `Explore ${nextPartner.showWhen === "hotel" ? "stays" : laneName(nextPartner).toLowerCase()}`
                  : "Add an activity"}
              </button>
              {view === "overview" ? addToTripMenu : null}
            </div>
          </div>
          <Card className="plan-overview-preview">
            <SectionHeader
              as="h3"
              title="Your itinerary at a glance"
              action={
                <button type="button" className={plan.textBtn} onClick={() => setView("itinerary")}>
                  View all days
                </button>
              }
            />
            {days.slice(0, 3).map((day) => {
              const dayItems = sorted
                .filter((item) => scheduledDayIndex(item, days) === day.index)
                .sort(compareScheduledItems);
              return (
                <div key={day.index} className="plan-preview-day">
                  <ListRow
                    title={day.label}
                    detail={day.detail || "Open day"}
                    trailing={
                      <button
                        type="button"
                        className="ui-row-action"
                        onClick={() => setQuickEntry({ type: "activity", day: day.index })}
                      >
                        Add
                      </button>
                    }
                  />
                  {dayItems.length ? (
                    <div className="plan-preview-entries">
                      {dayItems.map((item) => {
                        const time = itemScheduleTime(item);
                        return (
                          <div key={item.id} className="plan-entry-tint" {...entryTintProps(item)}>
                            <ListRow
                              title={item.title}
                              detail={
                                <>
                                  <span className="plan-entry-status">
                                    {entryStatusLabel(item.status)}
                                  </span>
                                  {time ? ` · ${time}` : ""}
                                </>
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`${plan.caption} text-muted`}>A day to make your own.</p>
                  )}
                </div>
              );
            })}
            {!days.length ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onEditTrip}
              >
                Add trip dates
              </button>
            ) : null}
            {unscheduled.length > 0 ? (
              <button
                type="button"
                className={plan.textBtn}
                onClick={() => setView("itinerary")}
              >
                {unscheduled.length} unscheduled{" "}
                {unscheduled.length === 1 ? "item" : "items"} to organize
              </button>
            ) : null}
          </Card>
        </div>
        <aside className="plan-overview-side">
          <Card className="plan-checklist">
            <SectionHeader as="h3" title="Booking checklist" />
            {partners.some((partner) => partner.showWhen !== "extra") ? (
              partners
                .filter((partner) => partner.showWhen !== "extra")
                .map((partner) => (
                  <ListRow
                    key={partner.key}
                    title={laneName(partner)}
                    detail={bookingProgress(itemsForLane(items, partner))}
                    onClick={() => openBookings(partner.key)}
                    trailing={<ChevronRight size={18} aria-hidden="true" />}
                  />
                ))
            ) : (
              <EmptyState>No searches selected. Add existing bookings or choose what you need in trip details.</EmptyState>
            )}
            <button type="button" className={plan.textBtn} onClick={onEditTrip}>
              Edit what you need
            </button>
          </Card>
          <JournalNotes
            headingId={headingId}
            destination={state.destination}
            notes={journalNotes}
            places={journalPlaceIndex}
          />
        </aside>
      </section>

      {guestBackup ? (
        <aside
          className={`plan-hub-draft ${plan.soft} plan-section plan-stack-tight`}
          aria-label="Browser draft"
        >
          <p className={`${plan.prose} text-text`}>
            You also have an unsaved itinerary for{" "}
            {guestBackup.state.destination.trim()} in this browser.
          </p>
          <div className="plan-actions plan-actions-inline">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRestoreBackup}
            >
              Restore that draft
            </button>
          </div>
        </aside>
      ) : null}

      <section
        id={`${headingId}-view-bookings`}
        role="tabpanel"
        aria-labelledby={`${headingId}-workspace-bookings`}
        hidden={view !== "bookings"}
        className="plan-hub-lanes plan-section scroll-mt-24"
      >
        <header className="plan-section-head plan-bookings-head">
          <h3 className={plan.h3}>Keep every booking together</h3>
          <p className="plan-head-desc">
            Search for something new or add a reservation you already have.
          </p>
          <div className="plan-head-status">
            {view === "bookings" ? (
              <div className="plan-head-action">{addToTripMenu}</div>
            ) : null}
            <div className="plan-quiet-toggles">
              <button
                type="button"
                className="plan-quiet-toggle plan-quiet-action"
                onClick={() => setQuickEntry({ type: "other" })}
              >
                Add manually
              </button>
            </div>
          </div>
        </header>
        {sorted.some(
          (item) =>
            item.type !== "note" &&
            !partners.some((partner) =>
              itemsForLane(items, partner).some(
                (entry) => entry.id === item.id,
              ),
            ),
        ) ? (
          <section className="plan-unassigned-bookings">
            <h3 className={plan.h3}>Added to this trip</h3>
            <ul className="plan-stack-tight">
              {sorted
                .filter(
                  (item) =>
                    item.type !== "note" &&
                    !partners.some((partner) =>
                      itemsForLane(items, partner).some(
                        (entry) => entry.id === item.id,
                      ),
                    ),
                )
                .map((item) => (
                  <li key={item.id}>
                    <ItemCard
                      item={item}
                      days={days}
                      onStatus={(status) => updateItem(item.id, { status })}
                      onEdit={() => setEditingId(item.id)}
                      onRemove={() => removeItem(item.id)}
                    />
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
        <div
          className="plan-lane-tabs-bar"
          role="tablist"
          aria-label="Booking lanes"
          aria-orientation="horizontal"
        >
          <div className="plan-lane-tabs" role="presentation">
            {partners.map((partner) => {
              const laneItems = itemsForLane(items, partner);
              const selected = selectedLaneKey === partner.key;
              const isNext = partner.key === nextLaneKey;
              const progress = laneProgress(laneItems);
              const panelId = lanePanelId(
                headingId,
                partner,
                flightLaneKey,
                stayLaneKey,
              );
              return (
                <button
                  key={partner.key}
                  type="button"
                  role="tab"
                  id={`${headingId}-tab-${partner.key}`}
                  className={`plan-lane-tab${isNext && progress === "open" ? " plan-lane-tab-next" : ""}`}
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setLanePin(partner.key)}
                  onKeyDown={(event) => onLaneTabKeyDown(event, partner.key)}
                >
                  <span className="plan-lane-tab-label">
                    {laneName(partner)}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              id={`${headingId}-outside-tab`}
              className="plan-lane-tab"
              aria-selected={outsideSelected}
              aria-controls={`${headingId}-outside`}
              tabIndex={outsideSelected ? 0 : -1}
              onClick={() => setLanePin(OUTSIDE_TAB)}
              onKeyDown={(event) => onLaneTabKeyDown(event, OUTSIDE_TAB)}
            >
              <span className="plan-lane-tab-label">Import a booking</span>
            </button>
          </div>
        </div>

        {partners.map((partner) => {
          const laneItems = itemsForLane(items, partner);
          const adding =
            editor?.kind === "add-lane" && editor.laneKey === partner.key;
          const selected = selectedLaneKey === partner.key;
          const panelId = lanePanelId(
            headingId,
            partner,
            flightLaneKey,
            stayLaneKey,
          );
          return (
            <div
              key={partner.key}
              role="tabpanel"
              id={panelId}
              aria-labelledby={`${headingId}-tab-${partner.key}`}
              hidden={!selected}
              className={`plan-lane plan-lane-panel scroll-mt-24 ${partner.isCore ? "plan-lane-core" : ""}`}
            >
              <div className="plan-lane-body">
                <div className="plan-lane-head">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="icon-tile icon-tile-sm shrink-0 plan-desktop-only">
                      <NavIcon name={laneIcon(partner)} size={16} />
                    </span>
                    <div className="min-w-0 plan-stack-tight">
                      <h3 className={plan.h3}>{partner.label}</h3>
                      {partner.blurb ? (
                        <p className={`${plan.body} text-muted`}>
                          {partner.blurb}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <LaneCta
                    partner={partner}
                    state={state}
                    flexibleOn={flexibleOn}
                    tripId={tripId}
                    className={`btn plan-lane-cta ${
                      partner.isCore ? "btn-primary" : "btn-secondary"
                    }`}
                  />
                </div>

                {laneItems.length === 0 ? (
                  <EmptyState>
                    {partner.key === "booking"
                      ? "Nothing saved here yet. Search stays and the hotel you book comes back to this itinerary."
                      : isFlightLanePartner(partner)
                        ? "Nothing saved here yet. Search flights and the one you book comes back to this itinerary."
                        : "Nothing saved here yet. Search, then add the booking you want to keep."}
                  </EmptyState>
                ) : (
                  <ul className="plan-stack-tight">
                    {laneItems.map((item) => {
                      const editing =
                        editor?.kind === "edit" &&
                        editor.place === "lane" &&
                        editor.id === item.id;
                      const highlighted =
                        (focusStay &&
                          partner.key === "booking" &&
                          item.id === newestBookedStayId(laneItems)) ||
                        (focusFlight &&
                          partner.key === flightLaneKey &&
                          item.id === newestBookedFlightId(laneItems));
                      return (
                        <li key={item.id}>
                          {editing ? (
                            <BookingItemForm
                              framed
                              type={item.type}
                              laneKey={item.laneKey}
                              sortOrder={item.sortOrder}
                              existing={item}
                              days={days}
                              onCancel={() => setEditor(null)}
                              onSave={replaceItem}
                            />
                          ) : (
                            <ItemCard
                              item={item}
                              days={days}
                              highlighted={highlighted}
                              onStatus={(status) =>
                                updateItem(item.id, { status })
                              }
                              onEdit={() => setEditingId(item.id)}
                              onRemove={() => removeItem(item.id)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {adding ? null : (
                  <div className="plan-lane-secondaries">
                    <button
                      type="button"
                      className={`${plan.textBtn} plan-lane-quiet self-start text-heading underline decoration-border underline-offset-2`}
                      onClick={() => {
                        setLanePin(partner.key);
                        setQuickEntry({
                          type: itemTypeForPartner(partner),
                          laneKey: partner.key,
                        });
                      }}
                    >
                      Add to itinerary
                    </button>
                    <button
                      type="button"
                      className={`${plan.textBtn} plan-lane-quiet self-start text-heading underline decoration-border underline-offset-2`}
                      onClick={() => {
                        setLanePin(OUTSIDE_TAB);
                        window.requestAnimationFrame(() => {
                          document
                            .querySelector(".plan-hub-lanes")
                            ?.scrollIntoView({ block: "start" });
                        });
                      }}
                    >
                      Import confirmation
                    </button>
                  </div>
                )}
                {adding ? (
                  <BookingItemForm
                    type={itemTypeForPartner(partner)}
                    laneKey={partner.key}
                    sortOrder={nextSort}
                    days={days}
                    onCancel={() => setEditor(null)}
                    onSave={addItem}
                  />
                ) : null}
              </div>
            </div>
          );
        })}

        <div
          role="tabpanel"
          id={`${headingId}-outside`}
          aria-labelledby={`${headingId}-outside-tab`}
          hidden={!outsideSelected}
          className="plan-lane-panel plan-lane-outside scroll-mt-24"
        >
          {outsideSelected ? (
            <ForwardBookings
              headingId={headingId}
              tripId={tripId}
              days={days}
              partners={partners}
              nextSort={nextSort}
              onAddItem={addItem}
              onRemember={onRememberGuestDraft}
              onClose={() => {
                setLanePin(nextLaneKey ?? partners[0]?.key ?? "auto");
                window.requestAnimationFrame(() => {
                  document
                    .querySelector(".plan-hub-lanes")
                    ?.scrollIntoView({ block: "start" });
                });
              }}
            />
          ) : null}
        </div>
      </section>

      <div
        id={`${headingId}-view-itinerary`}
        role="tabpanel"
        aria-labelledby={`${headingId}-workspace-itinerary`}
        hidden={view !== "itinerary"}
        className="plan-hub-days"
      >
        <PlanFold
          id={`${headingId}-days`}
          title="Itinerary"
          meta={
            days.length > 0
              ? `${sorted.length} ${sorted.length === 1 ? "item" : "items"}`
              : "Add dates"
          }
          defaultOpen
        >
          <section aria-labelledby={`${headingId}-list`}>
            <header className="plan-section-head">
              <h3 id={`${headingId}-list`} className={plan.h3}>
                Day-by-day schedule
              </h3>
              {view === "itinerary" ? (
                <div className="plan-head-action">{addToTripMenu}</div>
              ) : null}
              <div className="plan-head-status">
                {days.length > 0 ? (
                  <p className="plan-head-meta">
                    {days.length} {days.length === 1 ? "day" : "days"}
                  </p>
                ) : null}
                <div
                  className="plan-quiet-toggles"
                  role="tablist"
                  aria-label="Itinerary layout"
                >
                  {(
                    [
                      { id: "timeline", label: "Timeline" },
                      { id: "week", label: "Week" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`${headingId}-${tab.id}-tab`}
                      aria-selected={layout === tab.id}
                      aria-controls={`${headingId}-${tab.id}-panel`}
                      className="plan-quiet-toggle"
                      onClick={() => setLayout(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>
            {sorted.length === 0 ? (
              <p
                className={`${plan.prose} plan-follow text-muted plan-desktop-only`}
              >
                Your days are ready. Add a booking, activity, or note to start
                shaping your trip.
              </p>
            ) : null}
            {days.length === 0 ? (
              <p className={`${plan.caption} plan-follow text-muted`}>
                Add dates to split this trip into days.
              </p>
            ) : null}
            {layout === "timeline" ? (
              <div
                role="tabpanel"
                id={`${headingId}-timeline-panel`}
                aria-labelledby={`${headingId}-timeline-tab`}
              >
                {days.length > 0 ? (
                  <div className={`${plan.soft} plan-section`}>
                    <nav
                      aria-label="Jump to a day"
                      className="flex gap-2 overflow-x-auto pb-1"
                    >
                      {days.map((day) => {
                        const count = sorted.filter(
                          (item) =>
                            scheduledDayIndex(item, days) === day.index,
                        ).length;
                        return (
                          <a
                            key={day.index}
                            href={`#${headingId}-day-${day.index}`}
                            className="plan-control plan-day-chip inline-flex min-h-11 shrink-0 flex-col justify-center border border-border bg-white px-4 py-2"
                          >
                            <span
                              className={`${plan.caption} font-semibold whitespace-nowrap text-heading`}
                            >
                              {day.label}
                            </span>
                            <span
                              className={`${plan.caption} plan-week-day-count whitespace-nowrap`}
                            >
                              {count === 0 ? "Open" : count === 1 ? "1 plan" : `${count} plans`}
                            </span>
                          </a>
                        );
                      })}
                      <a
                        href={`#${headingId}-unscheduled`}
                        className="plan-control inline-flex min-h-11 shrink-0 flex-col justify-center border border-border bg-white px-4 py-2"
                      >
                        <span
                          className={`${plan.caption} font-semibold whitespace-nowrap text-heading`}
                        >
                          Unscheduled
                        </span>
                        <span
                          className={`${plan.caption} plan-week-day-count whitespace-nowrap`}
                        >
                          {unscheduled.length === 0
                            ? "No day yet"
                            : unscheduled.length === 1
                              ? "1 plan"
                              : `${unscheduled.length} plans`}
                        </span>
                      </a>
                    </nav>
                    <div className="plan-section relative">
                      <div
                        className="absolute bottom-2 left-[0.95rem] top-2 w-px bg-border"
                        aria-hidden="true"
                      />
                      <ol>
                        {days.map((day) => {
                          const dayItems = sorted
                            .filter(
                              (item) =>
                                scheduledDayIndex(item, days) ===
                                day.index,
                            )
                            .sort(compareScheduledItems);
                          return (
                            <li
                              key={day.index}
                              id={`${headingId}-day-${day.index}`}
                              className="plan-day relative flex scroll-mt-24 gap-3"
                            >
                              <span
                                className={`${plan.caption} relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-white font-semibold text-accent`}
                                aria-hidden="true"
                              >
                                {day.index}
                              </span>
                              <div
                                className={`${plan.inset} plan-day-card min-w-0 flex-1 border border-border bg-white`}
                              >
                                {day.detail ? (
                                  <p
                                    className={`${plan.caption} font-semibold text-muted`}
                                  >
                                    {day.detail}
                                  </p>
                                ) : null}
                                <h4 className={plan.h4}>{day.label}</h4>
                                {dayItems.length === 0 ? (
                                  <p
                                    className={`${plan.caption} text-muted plan-desktop-only`}
                                  >
                                    Nothing on this day yet.
                                  </p>
                                ) : (
                                  renderTimeline(dayItems)
                                )}
                                <button
                                  type="button"
                                  className={`${plan.textBtn} plan-add-plan`}
                                  onClick={() =>
                                    setQuickEntry({
                                      type: "activity",
                                      day: day.index,
                                    })
                                  }
                                >
                                  + Add a plan
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                ) : null}

                <section
                  id={`${headingId}-unscheduled`}
                  className={`${plan.soft} plan-section scroll-mt-24`}
                  aria-labelledby={`${headingId}-unscheduled-title`}
                >
                  <h4 id={`${headingId}-unscheduled-title`} className={plan.h4}>
                    Unscheduled
                  </h4>
                  {unscheduled.length === 0 ? (
                    <p
                      className={`${plan.body} plan-follow text-muted plan-desktop-only`}
                    >
                      Bookings without a day land here. Choose a day when you
                      add one.
                    </p>
                  ) : (
                    renderTimeline(unscheduled)
                  )}
                </section>
              </div>
            ) : (
              <div
                role="tabpanel"
                id={`${headingId}-week-panel`}
                aria-labelledby={`${headingId}-week-tab`}
              >
                {editor?.kind === "edit" && editor.place === "day" ? (
                  <div className="plan-follow">
                    {sorted
                      .filter((item) => item.id === editor.id)
                      .map((item) => (
                        <BookingItemForm
                          key={item.id}
                          framed
                          type={item.type}
                          existing={item}
                          days={days}
                          sortOrder={item.sortOrder}
                          onSave={replaceItem}
                          onCancel={() => setEditor(null)}
                        />
                      ))}
                  </div>
                ) : null}
                <WeekView
                  headingId={headingId}
                  days={days}
                  items={sorted}
                  onAssignDay={assignDay}
                  onEdit={setEditingId}
                  onRemove={removeItem}
                  onAddDay={(day) => setQuickEntry({ type: "activity", day })}
                />
              </div>
            )}

            {editor?.kind === "add-note" ? (
              <BookingItemForm
                type="note"
                sortOrder={nextSort}
                days={days}
                onCancel={() => setEditor(null)}
                onSave={addItem}
              />
            ) : (
              <button
                type="button"
                className={`${plan.textBtn} plan-follow self-start text-accent hover:underline`}
                onClick={() => setQuickEntry({ type: "note" })}
              >
                Add a note
              </button>
            )}
          </section>
        </PlanFold>
      </div>

      <div
        id={`${headingId}-view-packing`}
        role="tabpanel"
        aria-labelledby={`${headingId}-workspace-packing`}
        hidden={view !== "packing"}
        className="plan-packing-panel"
        tabIndex={0}
      >
        <PackingPanel
          headingId={headingId}
          notes={packingNotes}
          onChange={onPackingNotesChange}
          state={state}
          items={items}
          flexibleOn={flexibleOn}
          guides={packingGuides}
          headerAction={view === "packing" ? addToTripMenu : null}
        />
      </div>
      <div className="plan-hub-more" hidden={view === "bookings"}>
        <p className={`${plan.caption} px-1 pt-3 text-muted`}>
          {config.disclosure}{" "}
          <Link
            href="/affiliate-disclosure"
            className="text-link hover:text-accent"
          >
            Affiliate disclosure
          </Link>
          .
        </p>
      </div>

      {editingId && items.find((item) => item.id === editingId) ? (
        <TripEntryDialog
          fallbackFocusId={`${headingId}-add-trigger`}
          title="Edit trip item"
          onClose={() => setEditingId(null)}
        >
          {items
            .filter((item) => item.id === editingId)
            .map((item) => (
              <BookingItemForm
                key={item.id}
                type={item.type}
                existing={item}
                laneKey={item.laneKey}
                sortOrder={item.sortOrder}
                days={days}
                onCancel={() => setEditingId(null)}
                onSave={(next) => {
                  replaceItem(next);
                  setEditingId(null);
                }}
              />
            ))}
        </TripEntryDialog>
      ) : null}
      {quickEntry ? (
        <TripEntryDialog
          fallbackFocusId={`${headingId}-add-trigger`}
          title={
            quickEntry.type === "note"
              ? "Add a note"
              : quickEntry.type === "activity"
                ? "Add an activity"
                : "Add a booking"
          }
          onClose={() => setQuickEntry(null)}
        >
          {!quickEntry.laneKey &&
          !["activity", "note"].includes(quickEntry.type) ? (
            <label className="plan-field">
              <span className={plan.label}>Booking type</span>
              <select
                className={plan.input}
                value={quickEntry.type}
                onChange={(event) =>
                  setQuickEntry({
                    ...quickEntry,
                    type: event.target.value as TripItemType,
                  })
                }
              >
                <option value="other">Other booking</option>
                <option value="flight">Flight</option>
                <option value="hotel">Stay</option>
                <option value="car">Car</option>
              </select>
            </label>
          ) : null}
          <BookingItemForm
            key={quickEntry.day ?? 0}
            type={quickEntry.type}
            laneKey={quickEntry.laneKey}
            initialDay={quickEntry.day}
            sortOrder={nextSort}
            days={days}
            onCancel={() => setQuickEntry(null)}
            onSave={(item) => {
              addItem(item);
              setQuickEntry(null);
            }}
          />
        </TripEntryDialog>
      ) : null}
    </div>
  );
}
