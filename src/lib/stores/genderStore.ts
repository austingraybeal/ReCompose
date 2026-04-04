import { create } from 'zustand';

export type BodyGender = 'male' | 'female' | 'neutral';

interface GenderState {
  /** Currently selected body type */
  gender: BodyGender;
  /** Set the body type for gender-specific deformation curves */
  setGender: (gender: BodyGender) => void;
}

export const useGenderStore = create<GenderState>((set) => ({
  gender: 'male',
  setGender: (gender) => set({ gender }),
}));
