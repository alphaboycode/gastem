export interface ItemMetadata {
  name: string;
  description: string;
  imageUri: string;
  unique: boolean;
  maxSupply: bigint;
}

export interface Item extends ItemMetadata {
  id: bigint;
  balance: bigint;
  totalSupply: bigint;
}

export interface TransactionStatus {
  hash?: `0x${string}`;
  status: "idle" | "pending" | "success" | "error";
  message?: string;
}
