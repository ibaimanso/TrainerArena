import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly menuOpen = signal(false);

  ngOnInit(): void {
    void this.auth.loadOnce();
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    this.menuOpen.set(false);
    await this.router.navigateByUrl('/');
  }
}
