export class CreateRunDto {
  id?: string = '';
  name?: string = '';
  description?: string = '';
  status?: string = '';
  createdAt?: Date = new Date();
  updatedAt?: Date = new Date();
}
