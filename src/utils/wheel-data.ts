import { WheelOption } from './wheel-image-generator.js';

/**
 * Wheel categories with exactly 8 options each
 */
export const wheelCategories: Record<string, WheelOption[]> = {
  pfp: [
    {
      label: 'FURRY PFP',
      description: 'Change your profile picture to a furry image for 10 minutes.',
      duration: 10,
      type: 'pfp'
    },
    {
      label: 'FEMBOY PFP',
      description: 'Change your profile picture to a femboy image for 10 minutes.',
      duration: 10,
      type: 'pfp'
    },
    {
      label: 'ANIME PFP',
      description: 'Change your profile picture to an anime image for 10 minutes.',
      duration: 10,
      type: 'pfp'
    },
    {
      label: 'CAT PFP',
      description: 'Change your profile picture to a cat image for 5 minutes.',
      duration: 5,
      type: 'pfp'
    },
    {
      label: 'CURSED PFP',
      description: 'Change your profile picture to a cursed image for 10 minutes.',
      duration: 10,
      type: 'pfp'
    },
    {
      label: 'PINK PFP',
      description: 'Change your profile picture to a pink-themed image for 5 minutes.',
      duration: 5,
      type: 'pfp'
    },
    {
      label: 'MEME PFP',
      description: 'Change your profile picture to a meme image for 10 minutes.',
      duration: 10,
      type: 'pfp'
    },
    {
      label: 'YOUR CHOICE',
      description: 'Change your profile picture to whatever you want for 10 minutes.',
      duration: 10,
      type: 'pfp'
    }
  ],
  
  truthordare: [
    {
      label: 'TRUTH',
      description: "What's your most embarrassing online moment?",
      type: 'truth'
    },
    {
      label: 'DARE',
      description: 'Speak like a pirate for 5 minutes.',
      duration: 5,
      type: 'dare'
    },
    {
      label: 'TRUTH',
      description: 'Who would you trust most in this server?',
      type: 'truth'
    },
    {
      label: 'DARE',
      description: 'Send your next message using only emojis.',
      type: 'dare'
    },
    {
      label: 'TRUTH',
      description: "What's the weirdest thing you've searched online?",
      type: 'truth'
    },
    {
      label: 'DARE',
      description: 'Change your nickname to something ridiculous for 10 minutes.',
      duration: 10,
      type: 'dare'
    },
    {
      label: 'TRUTH',
      description: "What's a completely irrational fear you have?",
      type: 'truth'
    },
    {
      label: 'DARE',
      description: 'Talk like a customer-service employee for 5 minutes.',
      duration: 5,
      type: 'dare'
    }
  ],
  
  punishment: [
    {
      label: 'TIMEOUT',
      description: 'You get a 5-minute timeout.',
      duration: 5,
      type: 'timeout'
    },
    {
      label: 'SILLY NICKNAME',
      description: 'Change your nickname to something silly for 10 minutes.',
      duration: 10,
      type: 'nickname'
    },
    {
      label: 'LOWERCASE ONLY',
      description: 'Speak only in lowercase for 5 minutes.',
      duration: 5,
      type: 'speech'
    },
    {
      label: 'NO EMOJIS',
      description: 'No emojis allowed for 5 minutes.',
      duration: 5,
      type: 'restriction'
    },
    {
      label: 'WHEEL VICTIM',
      description: 'You get the temporary "Wheel Victim" role for 10 minutes.',
      duration: 10,
      type: 'role'
    },
    {
      label: 'NPC MODE',
      description: 'Talk like an NPC for 5 minutes.',
      duration: 5,
      type: 'speech'
    },
    {
      label: 'NICKNAME CHOICE',
      description: 'Let the next person choose your nickname for 10 minutes.',
      duration: 10,
      type: 'nickname'
    },
    {
      label: 'NOTHING 😭',
      description: 'Nothing happens! You got lucky.',
      type: 'none'
    }
  ],
  
  act: [
    {
      label: 'NPC ACT',
      description: 'Act like an NPC for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'VILLAIN ACT',
      description: 'Act like a villain for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'FORMAL ACT',
      description: 'Act extremely formal for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'PIRATE ACT',
      description: 'Act like a pirate for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'ROBOT ACT',
      description: 'Act like a robot for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'SERVICE ACT',
      description: 'Act like the server\'s customer-service employee.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'QUESTIONS ACT',
      description: 'Speak only in questions for 5 minutes.',
      duration: 5,
      type: 'act'
    },
    {
      label: 'MAIN CHARACTER',
      description: 'Act like the main character for 5 minutes.',
      duration: 5,
      type: 'act'
    }
  ]
};

/**
 * Get available category names
 */
export function getWheelCategories(): string[] {
  return Object.keys(wheelCategories);
}

/**
 * Get options for a specific category
 */
export function getWheelOptions(category: string): WheelOption[] | null {
  return wheelCategories[category] || null;
}

/**
 * Validate if a category exists
 */
export function isValidCategory(category: string): boolean {
  return category in wheelCategories;
}