/**
 * Telegram Bot Module for Train Service Notifications
 * 
 * This module handles Telegram bot functionality for sending notifications
 * about train delay insurance queries and status updates.
 * Uses the Telegraf library for Telegram Bot API interactions.
 */

const { Telegraf } = require("telegraf");
require("dotenv").config();

// Initialize Telegram bot with token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN_PILOT);

// Target chat/group ID for sending notifications
const CHAT_ID = process.env.CHAT_ID; // telegram group

// Start the bot and begin listening for messages
bot.launch();
console.log("Launched bot..");

/**
 * MESSAGING FUNCTIONS
 */

/**
 * Sends a formatted message to the configured Telegram chat
 * @param {string} msg - The message text to send
 * @throws {Error} If message sending fails
 */
function sendMsg(msg) {
  bot.telegram
    .sendMessage(CHAT_ID, format(msg), {
      parse_mode: "MarkdownV2", // Enable Telegram MarkdownV2 formatting
      disable_web_page_preview: true, // Prevent automatic link previews
    })
    .catch((err) => {
      throw new Error(err.message);
    });
}

/**
 * Escapes special characters for Telegram MarkdownV2 format
 * MarkdownV2 requires specific characters to be escaped with backslashes
 * to prevent parsing errors when sending formatted messages
 * 
 * @param {string} text - The input text to escape
 * @returns {string} The escaped text safe for MarkdownV2
 */
function format(text) {
  // Escape all special MarkdownV2 characters
  text = text.replaceAll(".", "\\.");   // Dots
  text = text.replaceAll("[", "\\[");   // Square brackets
  text = text.replaceAll("]", "\\]");
  text = text.replaceAll("!", "\\!");   // Exclamation marks
  text = text.replaceAll("?", "\\?");   // Question marks
  text = text.replaceAll(":", "\\:");   // Colons
  text = text.replaceAll("%", "\\%");   // Percent signs
  text = text.replaceAll("+", "\\+");   // Plus signs
  text = text.replaceAll("&", "\\&");   // Ampersands
  text = text.replaceAll("$", "\\$");   // Dollar signs
  text = text.replaceAll("-", "\\-");   // Hyphens
  text = text.replaceAll("{", "\\{");   // Curly braces
  text = text.replaceAll("}", "\\}");
  text = text.replaceAll("(", "\\(");   // Parentheses
  text = text.replaceAll(")", "\\)");

  return text;
}

/**
 * UTILITY FUNCTIONS
 */

/**
 * Gets the current timestamp formatted in German locale
 * @returns {string} Current date and time in German format
 */
function getTime() {
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };
  const time = new Date().toLocaleDateString("de-DE", options);
  return time;
}

/**
 * Builds a formatted string of all stops in a journey
 * Creates a readable route representation showing the complete journey path
 * 
 * @param {Object} journey - Journey object containing multiple legs
 * @returns {string} Formatted stops string (e.g., "Berlin HBF - Hamburg HBF - Bremen HBF")
 */
function retrieveStops(journey) {
  let stops = "";
  stops += journey["leg_1"].start_stop; // Add the initial departure station
  
  // Iterate through all legs and add each arrival station
  for (const leg in journey) {
    stops += " - " + journey[leg].arrival_stop;
  }
  return stops;
}

/**
 * Retrieves and formats the departure date and time for a journey
 * Extracts departure information from the first leg of the journey
 * and formats it in German locale for display
 * 
 * @param {Object} _journey - Journey object containing leg information
 * @returns {string} Formatted departure date string in German
 * @throws {Error} If journey data is missing or invalid
 */
function retrieveDepartureDateString(_journey) {
  // Get first leg of the journey (departure information)
  const departureLeg = _journey["leg_" + 1];

  if (departureLeg) {
    // Create date object from the departure date string
    const departureDate = new Date(departureLeg.start_date);

    // Parse and set the departure time (hours and minutes)
    const departureTime = departureLeg.start_time;
    departureDate.setHours(departureTime.split(":")[0]);
    departureDate.setMinutes(departureTime.split(":")[1]);

    // German locale formatting options for readable date display
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    };

    return departureDate.toLocaleDateString("de-DE", options);
    // e.g.: 19. September 2023 um 15:50:00
  } else {
    throw new Error("Missing Data");
  }
}

/**
 * MODULE EXPORTS
 * 
 * Exported functions for use in other modules:
 * - sendMsg: Send formatted messages to Telegram
 * - getTime: Get current timestamp in German format
 * - retrieveStops: Format journey stops into readable string
 * - retrieveDepartureDateString: Format departure date/time for display
 */
module.exports = {
  sendMsg,
  getTime,
  retrieveStops,
  retrieveDepartureDateString,
};
