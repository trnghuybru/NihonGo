export type GenkoEditorProps = {
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  onComposingChange?: (composing: boolean) => void;
};
