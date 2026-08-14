export interface WheelOption {
  label: string;
  description: string;
  duration?: number;
  type?: string;
}

export interface WheelCategory {
  name: string;
  options: WheelOption[];
}

export const wheelCategories: Record<string, WheelCategory> = {
  pfp: {
    name: 'Profile Picture',
    options: [
      {
        label: 'FURRY PFP',
        description: 'Change your profile picture to a furry image for 10 minutes.',
        duration: 10,
      },
      {
        label: 'FEMBOY PFP',
        description: 'Change your profile picture to a femboy image for 10 minutes.',
        duration: 10,
      },
      {
        label: 'ANIME PFP',
        description: 'Change your profile picture to an anime image for 10 minutes.',
        duration: 10,
      },
      {
        label: 'CAT PFP',
        description: 'Change your profile picture to a cat image for 5 minutes.',
        duration: 5,
      },
      {
        label: 'CURSED PFP',
        description: 'Change your profile picture to a cursed image for 10 minutes.',
        duration: 10,
      },
      {
        label: 'PINK PFP',
        description: 'Change your profile picture to a pink-themed image for 5 minutes.',
        duration: 5,
      },
      {
        label: 'MEME PFP',
        description: 'Change your profile picture to a meme image for 10 minutes.',
        duration: 10,
      },
      {
        label: 'YOUR CHOICE',
        description: 'Change your profile picture to whatever you want for 10 minutes.',
        duration: 10,
      },
    ],
  },
  truthordare: {
    name: 'Truth or Dare',
    options: [
      {
        label: 'TRUTH',
        description: "What's your most embarrassing online moment?",
        type: 'truth',
      },
      {
        label: 'DARE',
        description: 'Speak like a pirate for 5 minutes.',
        duration: 5,
      },
      {
        label: 'TRUTH',
        description: 'Who would you trust most in this server?',
        type: 'truth',
      },
      {
        label: 'DARE',
        description: 'Send your next message using only emojis.',
        type: 'dare',
      },
      {
        label: 'TRUTH',
        description: "What's the weirdest thing you've searched online?",
        type: 'truth',
      },
      {
        label: 'DARE',
        description: 'Change your nickname to something ridiculous for 10 minutes.',
        duration: 10,
      },
      {
        label: 'TRUTH',
        description: "What's a completely irrational fear you have?",
        type: 'truth',
      },
      {
        label: 'DARE',
        description: 'Talk like a customer-service employee for 5 minutes.',
        duration: 5,
      },
    ],
  },
  punishment: {
    name: 'Punishment',
    options: [
      {
        label: 'TIMEOUT',
        description: 'You get a 5-minute timeout.',
        duration: 5,
      },
      {
        label: 'SILLY NICKNAME',
        description: 'Change your nickname to something silly for 10 minutes.',
        duration: 10,
      },
      {
        label: 'LOWERCASE ONLY',
        description: 'Speak only in lowercase for 5 minutes.',
        duration: 5,
      },
      {
        label: 'NO EMOJIS',
        description: 'No emojis allowed for 5 minutes.',
        duration: 5,
      },
      {
        label: 'WHEEL VICTIM',
        description: 'You get the "Wheel Victim" role for 10 minutes.',
        duration: 10,
      },
      {
        label: 'NPC MODE',
        description: 'Talk like an NPC for 5 minutes.',
        duration: 5,
      },
      {
        label: 'NICKNAME CHOICE',
        description: 'Let the next person choose your nickname for 10 minutes.',
        duration: 10,
      },
      {
        label: 'LUCKY',
        description: 'Nothing happens! You got lucky 😭',
      },
    ],
  },
  act: {
    name: 'Act',
    options: [
      {
        label: 'NPC',
        description: 'Act like an NPC for 5 minutes.',
        duration: 5,
      },
      {
        label: 'VILLAIN',
        description: 'Act like a villain for 5 minutes.',
        duration: 5,
      },
      {
        label: 'FORMAL',
        description: 'Act extremely formal for 5 minutes.',
        duration: 5,
      },
      {
        label: 'PIRATE',
        description: 'Act like a pirate for 5 minutes.',
        duration: 5,
      },
      {
        label: 'ROBOT',
        description: 'Act like a robot for 5 minutes.',
        duration: 5,
      },
      {
        label: 'SERVICE',
        description: 'Act like the server\'s customer-service employee.',
      },
      {
        label: 'QUESTIONS',
        description: 'Speak only in questions for 5 minutes.',
        duration: 5,
      },
      {
        label: 'MAIN CHARACTER',
        description: 'Act like the main character for 5 minutes.',
        duration: 5,
      },
    ],
  },
};

export function getCategory(categoryKey: string): WheelCategory | null {
  return wheelCategories[categoryKey.toLowerCase()] || null;
}

export function getAllCategoryNames(): string[] {
  return Object.keys(wheelCategories);
}
