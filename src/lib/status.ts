import type { Todo, TodoStatus } from '../types';

export const STATUSES: { id: TodoStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export const statusOf = (t: Todo): TodoStatus => (t.done ? 'done' : t.inProgress ? 'doing' : 'todo');

export const statusFields = (status: TodoStatus) => ({
  done: status === 'done',
  inProgress: status === 'doing',
});
