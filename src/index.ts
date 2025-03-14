import dotenv from "dotenv";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { initializeGraph } from "./graph.js";
import { type Message } from "../types/types.js";
import { tryCatch } from "../utils/try-catch.js";

dotenv.config();

const graph = initializeGraph();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const lastFewMessages: Message[] = [];
const discordIdRegex = /<@(\d+)>/g;

client.on(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`);

  const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID!);

  if (!channel || !channel.isTextBased()) {
    console.error("Invalid channel or channel type is not supported");
    return;
  }

  const { data, error } = await tryCatch(channel.messages.fetch({ limit: 10 }));
  if (error) {
    console.error("Error fetching messages:", error);
    return;
  }

  console.log("Retrieved messages count:", data.size);

  data.forEach((message) => {
    message.content = message.content.replace(discordIdRegex, "").trim();
    lastFewMessages.push({
      author: message.author.username,
      content: message.content,
    });
  });
});

client.on(Events.MessageCreate, async (readyClient) => {
  if (readyClient.author.bot) return;
  if (!readyClient.mentions.has(client.user?.id || "")) return;

  const userMessage = readyClient.content.replace(discordIdRegex, "").trim();

  const graphInput = {
    message: {
      author: readyClient.author.username,
      content: userMessage,
    } as Message,
    previousMessages: lastFewMessages,
  };

  try {
    const finalState = await graph.invoke(graphInput);
    console.log(finalState);

    // Currently, I'm simply sending a msg, but depending on the context
    // we can create an embed, tag relevant mods or anything else.
    // Once confirmed with the team, I'll implement this.
    if (finalState.chatHistoryResponse) {
      const response = finalState.chatHistoryResponse.isRelevantTopic
        ? finalState.chatHistoryResponse.response
        : "I'm sorry, I'm only able to help with AIs and CopilotKit";
      await readyClient.reply(response);
      return;
    }

    if (finalState.supportTicket?.question?.answer) {
      await readyClient.reply(finalState.supportTicket.question.answer);
      return;
    }

    await readyClient.reply(
      "I'm not sure if I have a response to this request :(",
    );
  } catch (error) {
    console.error("Error generating AI response:", error);
    await readyClient.reply(
      "Sorry, I encountered an error while processing your request.",
    );
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
