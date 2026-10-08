import { collectMessages } from "../lib/source.mts";
const result = await collectMessages();
console.log(JSON.stringify({
  count: result.messages.length,
  translated: result.messages.filter(message => message.textZh).length,
  starred: result.messages.filter(message => message.isResetMention).length,
  incomplete: result.messages.filter(message => message.contentIncomplete).length,
  newest: result.messages[0]?.messageAt,
  warning: result.warning,
}, null, 2));
