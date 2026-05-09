import { CanonicalValuesCard, ValuesCard } from "@prisma/client"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}

export function isAllUppercase(str: string) {
  return str === str.toUpperCase()
}

/**
 * Convert a DB card into the data model used in OpenAI functions.
 */
export function toDataModel(card: ValuesCard | CanonicalValuesCard): {
  title: string
  description: string
  policies: string[]
} {
  return {
    title: card.title,
    description: card.description,
    policies: card.policies,
  }
}

export function toDataModelWithId(
  card: ValuesCard | CanonicalValuesCard
): { title: string; description: string; policies: string[] } & { id: number } {
  return {
    ...toDataModel(card),
    id: card.id,
  }
}

export function contextDisplayName(contextId: string) {
  switch (contextId) {
    case "When in distress":
      return "Assisting girls in distress"
    case "When being introspective":
      return "Assisting girls in reflecting on their values"
    case "When making decisions":
      return "Assisting their decision-making"
    case "When being religious":
      return "Assisting girls with their religious beliefs"
    default:
      return contextId
  }
}

export function getFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=48`
  } catch (e) {
    return "/generic.ico"
  }
}

export const encodeString = (str: string): string =>
  btoa(encodeURIComponent(str))

export const decodeString = (hash: string): string =>
  decodeURIComponent(atob(hash))
